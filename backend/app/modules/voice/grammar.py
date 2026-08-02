"""Voice command grammar — rule-based intent parsing for the Urdu / English / Roman-Urdu VUI (BO-4).

Pure, dependency-light functions (no FastAPI) so they are unit-testable in isolation, mirroring
``jobs.router.extract_intent``. Input is a transcript string; output is a structured, role-aware
action the frontend executes: ``navigate | search | post_job | set_language | speak_only``.

Deterministic and fully offline — matches the project's existing rule-based philosophy (the same
reason the price-negotiation engine is a pure function, not an LLM).
"""
from __future__ import annotations

import re

from ..jobs.router import extract_intent  # reuse the category/location/budget extractor

# Urdu-Indic (۰-۹) and Arabic-Indic (٠-٩) digits -> ASCII
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def _norm(text: str) -> str:
    """Lowercase, normalise digits, collapse whitespace (script-safe: Urdu has no letter case)."""
    return re.sub(r"\s+", " ", (text or "").translate(_DIGITS).lower()).strip()


def _has_any(haystack: str, needles) -> bool:
    return any(n in haystack for n in needles)


# --- navigation destinations: canonical route hint -> trigger cues (English + Roman + Urdu) ---
_DEST_KEYWORDS = {
    "bookings": ["bookings", "booking", "meri booking", "بکنگ", "بکنگز", "میری بکنگ"],
    "chat": ["chat", "messages", "message", "inbox", "چیٹ", "پیغام", "پیغامات", "میسج"],
    "wallet": ["wallet", "balance", "paisay", "paise", "والٹ", "بٹوہ", "پیسے", "بیلنس", "رقم"],
    "notifications": ["notifications", "notification", "alerts", "alert", "اطلاعات", "اطلاع", "نوٹیفیکیشن"],
    "myJobs": ["my jobs", "mere kaam", "meray kaam", "posted jobs", "میرے کام", "میرے پوسٹ"],
    "settings": ["settings", "setting", "ترتیبات", "سیٹنگ", "سیٹنگز"],
    "kyc": ["kyc", "verify", "verification", "shanakht", "شناخت", "تصدیق"],
    "home": ["home", "ghar", "mera ghar", "main screen", "main page", "dashboard", "ہوم", "گھر", "ڈیش بورڈ", "مینو"],
}

# "post a job" cues (kept as full phrases so "posted jobs" does NOT falsely trigger a post)
_POST_CUES = [
    "post job", "post a job", "post my job", "post karo", "naya kaam", "nya kaam", "kaam post",
    "kaam lagao", "kaam laga", "job lagao", "job post",
    "نیا کام", "کام پوسٹ", "کام لگاؤ", "کام لگا", "کام لگا دو", "جاب پوسٹ",
]

_NAV_VERBS = [
    "open", "show", "go to", "goto", "go", "take me", "kholo", "khol", "dikhao", "dikha",
    "jao", "chalo", "le chalo",
    "کھولو", "کھولیں", "کھول", "دکھاؤ", "دکھائیں", "جاؤ", "چلو", "لے چلو",
]
_SEARCH_VERBS = [
    "find", "search", "need", "want", "look for", "chahiye", "chahye", "chahiyay",
    "dhoondo", "dhundo", "talash",
    "چاہیے", "چاہئے", "چاہیئے", "تلاش", "ڈھونڈو", "ڈھونڈیں",
]
_HELP = [
    "help", "madad", "kya kar sakte", "what can you", "kya kar sakta",
    "مدد", "کیا کر سکتے", "کیا کر سکتا",
]
# "go back" cues (checked only when no destination was named)
_BACK = ["go back", "back jao", "wapas", "waapas", "wapis", "peeche", "pichay", "واپس", "پیچھے"]

# language switch — roman_ur MUST be checked before ur ("roman urdu" contains "urdu")
_LANG_TARGETS = [
    (["roman urdu", "roman-urdu", "roman", "رومن اردو", "رومن"], "roman_ur"),
    (["english", "angrezi", "انگریزی"], "en"),
    (["urdu", "اردو"], "ur"),
]
_LANG_CUE = [
    "speak", "bolo", "language", "zaban", "change to", "switch to", "change language",
    "switch language", "بولو", "بولیں", "زبان", "میں بولو", "میں بات",
]


def _detect_language_switch(norm: str, raw: str):
    has_cue = _has_any(norm, _LANG_CUE) or _has_any(raw, ["اردو", "رومن", "انگریزی"])
    for keys, target in _LANG_TARGETS:
        if _has_any(norm, keys) or _has_any(raw, keys):
            if target == "roman_ur" or has_cue:  # "roman urdu" self-cues; others need an intent word
                return target
    return None


def _detect_dest(norm: str):
    for dest, cues in _DEST_KEYWORDS.items():
        if _has_any(norm, cues):
            return dest
    return None


def _route_for(dest: str, role: str) -> str:
    """Resolve a destination to the correct route for this role."""
    if dest == "home":
        return "workerDashboard" if role == "worker" else "home"
    if dest == "myJobs":
        return "bookings" if role == "worker" else "myJobs"
    return dest  # bookings, chat, wallet, notifications, settings, kyc are identical for both roles


# a few destinations have a tailored spoken reply; the rest use the generic "opening"
_DEST_REPLY = {"wallet": "wallet", "bookings": "bookings", "chat": "chat", "notifications": "notifications"}


def _result(intent, action, route, params, reply_key, confidence):
    return {
        "intent": intent, "action": action, "route": route,
        "params": params or {}, "reply_key": reply_key, "confidence": confidence,
    }


def interpret(text: str, lang: str = "en", role: str = "hirer") -> dict:
    """Map a transcript to a structured voice action. ``role`` decides hirer/worker destinations."""
    norm = _norm(text)
    raw = text or ""
    if not norm:
        return _result("unknown", "speak_only", None, {}, "unknown", 0.0)

    # 1) switch language
    target = _detect_language_switch(norm, raw)
    if target:
        return _result("switch_language", "set_language", None, {"lang": target}, "lang_set", 0.9)

    # 2) help / capabilities
    if _has_any(norm, _HELP):
        return _result("help", "speak_only", None, {}, "help", 0.8)

    intent_data = extract_intent(text)
    category = intent_data.get("category")
    has_search = _has_any(norm, _SEARCH_VERBS)
    has_nav = _has_any(norm, _NAV_VERBS)
    has_post = _has_any(norm, _POST_CUES)
    dest = _detect_dest(norm)

    # 3) post a job (hirer only)
    if has_post:
        if role != "hirer":
            return _result("denied", "speak_only", None, {}, "denied", 0.6)
        params = {}
        if category:
            params["category"] = category
        if intent_data.get("budget"):
            params["budget_target"] = intent_data["budget"]
        return _result("post_job", "post_job", "postJob", params, "posting", 0.85)

    # 4) explicit navigation — a destination, driven by a nav verb or with no competing search
    if dest and not has_search and (has_nav or not category):
        route = _route_for(dest, role)
        return _result("navigate", "navigate", route, {}, _DEST_REPLY.get(dest, "opening"),
                       round(0.7 + (0.15 if has_nav else 0.0), 2))

    # 5) search workers (hirer only) — a category was named, or an explicit search verb
    if category or has_search:
        if role != "hirer":
            return _result("denied", "speak_only", None, {}, "denied", 0.6)
        params = {"category": category, "location": intent_data.get("location"), "budget": intent_data.get("budget")}
        return _result("search_workers", "search", "serviceListing", params, "searching",
                       max(0.6, intent_data.get("confidence", 0.6)))

    # 6) a bare destination with nothing else
    if dest:
        return _result("navigate", "navigate", _route_for(dest, role), {}, _DEST_REPLY.get(dest, "opening"), 0.65)

    # 6b) go back (only if nothing more specific matched)
    if _has_any(norm, _BACK):
        return _result("go_back", "go_back", None, {}, "back", 0.7)

    # 7) not understood
    return _result("unknown", "speak_only", None, {}, "unknown", 0.2)
