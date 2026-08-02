"""VOICE module — the Urdu / English / Roman-Urdu Voice User Interface backend (BO-4).

Two role-neutral endpoints (any authenticated user — unlike the hirer-only /jobs/search/nl):
  POST /voice/transcribe  — base64 audio -> text, via the STT adapter (mock | local Whisper)
  POST /voice/interpret   — text -> a structured, role-aware voice action + a spoken reply

The spoken reply is returned as both an on-screen ``reply`` (in the user's language) and a
``tts_text`` (Urdu-script for ur/roman_ur, since a TTS Urdu voice cannot pronounce Latin letters).
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ... import adapters
from ...core.deps import get_current_user
from ...models import User
from . import grammar

router = APIRouter(prefix="/voice", tags=["voice"])


class TranscribeIn(BaseModel):
    voice_b64: str
    lang: str = "ur"


class TranscribeOut(BaseModel):
    text: str
    lang: str


class InterpretIn(BaseModel):
    text: str
    lang: str = "en"


class InterpretOut(BaseModel):
    intent: str
    action: str
    route: Optional[str] = None
    params: dict = {}
    reply: str
    reply_lang: str
    tts_text: str
    tts_lang: str
    confidence: float


# On-screen + spoken replies. Each key holds en / ur / roman_ur; the ur (script) form is what we
# SPEAK for both ur and roman_ur so the device TTS voice pronounces it correctly.
_REPLIES = {
    "opening":       {"en": "Opening it now.",
                      "ur": "کھول رہا ہوں۔",
                      "roman_ur": "Khol raha hoon."},
    "searching":     {"en": "Searching for workers near you.",
                      "ur": "آپ کے قریب کاریگر تلاش کر رہا ہوں۔",
                      "roman_ur": "Aap ke qareeb kaarigar talaash kar raha hoon."},
    "posting":       {"en": "Let's post your job.",
                      "ur": "آئیے آپ کا کام پوسٹ کرتے ہیں۔",
                      "roman_ur": "Aaiye aap ka kaam post karte hain."},
    "wallet":        {"en": "Opening your wallet.",
                      "ur": "آپ کا والٹ کھول رہا ہوں۔",
                      "roman_ur": "Aap ka wallet khol raha hoon."},
    "bookings":      {"en": "Opening your bookings.",
                      "ur": "آپ کی بکنگز کھول رہا ہوں۔",
                      "roman_ur": "Aap ki bookings khol raha hoon."},
    "chat":          {"en": "Opening your messages.",
                      "ur": "آپ کے پیغامات کھول رہا ہوں۔",
                      "roman_ur": "Aap ke paighaamaat khol raha hoon."},
    "notifications": {"en": "Opening your notifications.",
                      "ur": "آپ کی اطلاعات کھول رہا ہوں۔",
                      "roman_ur": "Aap ki ittila-aat khol raha hoon."},
    "lang_set":      {"en": "Language switched.",
                      "ur": "زبان تبدیل کر دی گئی ہے۔",
                      "roman_ur": "Zabaan tabdeel kar di gayi hai."},
    "help":          {"en": "You can say: find a plumber, post a job, open my wallet, or show my bookings.",
                      "ur": "آپ کہہ سکتے ہیں: پلمبر تلاش کرو، کام پوسٹ کرو، والٹ کھولو، یا میری بکنگ دکھاؤ۔",
                      "roman_ur": "Aap keh sakte hain: plumber talaash karo, kaam post karo, wallet kholo, ya meri booking dikhao."},
    "unknown":       {"en": "Sorry, I didn't catch that. Try: find a plumber, or open my wallet.",
                      "ur": "معاف کیجیے، میں سمجھ نہیں سکا۔ کہیں: پلمبر تلاش کرو، یا والٹ کھولو۔",
                      "roman_ur": "Maaf kijiye, main samajh nahin saka. Kahein: plumber talaash karo, ya wallet kholo."},
    "denied":        {"en": "That option is available to customers.",
                      "ur": "یہ سہولت گاہکوں کے لیے ہے۔",
                      "roman_ur": "Yeh sahulat gaahkon ke liye hai."},
    "back":          {"en": "Going back.",
                      "ur": "واپس جا رہا ہوں۔",
                      "roman_ur": "Wapas ja raha hoon."},
}


def _resolve_reply(reply_key: str, lang: str) -> dict:
    entry = _REPLIES.get(reply_key, _REPLIES["opening"])
    lang = lang if lang in ("en", "ur", "roman_ur") else "en"
    is_urdu_voice = lang in ("ur", "roman_ur")
    return {
        "reply": entry[lang],
        "reply_lang": lang,
        # speak the Urdu-script text for ur AND roman_ur; English otherwise
        "tts_text": entry["ur"] if is_urdu_voice else entry["en"],
        "tts_lang": "ur-PK" if is_urdu_voice else "en-US",
    }


@router.post("/transcribe", response_model=TranscribeOut)
def voice_transcribe(payload: TranscribeIn, user: User = Depends(get_current_user)):
    """Transcribe a base64 audio clip. Role-neutral so workers can use voice too."""
    out = adapters.transcribe(payload.voice_b64, payload.lang)
    return TranscribeOut(text=out.get("text", ""), lang=out.get("lang", payload.lang))


@router.post("/interpret", response_model=InterpretOut)
def voice_interpret(payload: InterpretIn, user: User = Depends(get_current_user)):
    """Interpret a transcript into a role-aware action + a localized spoken reply."""
    result = grammar.interpret(payload.text, payload.lang, user.role)
    reply = _resolve_reply(result["reply_key"], payload.lang)
    return InterpretOut(
        intent=result["intent"], action=result["action"], route=result.get("route"),
        params=result.get("params") or {}, confidence=result.get("confidence", 0.0), **reply,
    )
