"""Adapter layer (anti-corruption). Mock implementations by default.

Every external provider is reached only through these functions. Swapping to a real
provider is a matter of adding an implementation and flipping the env var — no module
code changes. All mocks are deterministic so tests are reproducible offline.
"""
from __future__ import annotations

import base64
import hashlib
import os
import re
import tempfile

from ..core.config import settings

# ------------------------------------------------------------------ OTP (SMS/WhatsApp)
_sent_otps: dict[str, str] = {}


def send_otp(phone: str, code: str, channel: str = "sms") -> dict:
    _sent_otps[phone] = code  # dev aid; a real gateway would deliver the SMS/WhatsApp
    return {"provider": settings.otp_provider, "channel": channel, "sent": True}


def last_sent_otp(phone: str) -> str | None:
    return _sent_otps.get(phone)


# ------------------------------------------------------------------ NADRA / Nishan
def verify_identity(cnic: str, full_name: str, dob: str, card_issue_date: str) -> dict:
    """Mock demographic match: valid 13-digit CNIC + a name passes."""
    digits = re.sub(r"\D", "", cnic or "")
    match = len(digits) == 13 and bool((full_name or "").strip())
    ref = "NADRA-" + hashlib.sha256((cnic or "x").encode()).hexdigest()[:10].upper()
    return {"match": match, "provider_ref": ref}


def verify_biometric(fingerprint_b64: str | None, portrait_b64: str | None) -> dict:
    """Mock similarity: both modalities -> high score; portrait only -> mid; none -> low."""
    if fingerprint_b64 and portrait_b64:
        score = 0.92
    elif portrait_b64 or fingerprint_b64:
        score = 0.55
    else:
        score = 0.10
    return {"score": score}


# ------------------------------------------------------------------ Payments (EasyPaisa/JazzCash)
def _ref(provider: str, kind: str, key: str) -> str:
    return f"{provider.upper()}-{kind}-{hashlib.sha256(key.encode()).hexdigest()[:8].upper()}"


def escrow_hold(booking_id: str, provider: str, amount: float) -> dict:
    return {"status": "held", "amount": amount, "provider_ref": _ref(provider, "HOLD", booking_id)}


def escrow_release(booking_id: str, provider: str, amount: float) -> dict:
    return {"status": "released", "amount": amount, "provider_ref": _ref(provider, "REL", booking_id)}


def collect_platform_fee(booking_id: str, provider: str, amount: float) -> dict:
    return {"status": "held", "amount": amount, "provider_ref": _ref(provider, "FEE", booking_id)}


def refund(booking_id: str, provider: str, amount: float) -> dict:
    return {"status": "refunded", "amount": amount, "provider_ref": _ref(provider, "RFND", booking_id)}


def topup(user_id: str, provider: str, amount: float) -> dict:
    """Wallet top-up from EasyPaisa/JazzCash. MOCK: credits instantly.

    Real integration: initiate a provider transaction (returns a checkout/redirect), then
    credit the wallet only after the provider's signed webhook confirms the payment.
    """
    return {"status": "received", "amount": amount, "provider_ref": _ref(provider, "TOPUP", user_id)}


# ------------------------------------------------------------------ Speech-to-Text (Whisper)
_whisper_model = None  # lazily-loaded, process-cached faster-whisper model


def _get_whisper_model():
    """Load and cache a local faster-whisper model. The import lives HERE (not at module top)
    so `faster-whisper` stays an OPTIONAL dependency — the mock path and the test suite never
    import it. Install with: pip install -r requirements-whisper.txt"""
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        kwargs = {"device": settings.whisper_device, "compute_type": settings.whisper_compute_type}
        if settings.whisper_download_root:
            kwargs["download_root"] = settings.whisper_download_root
        _whisper_model = WhisperModel(settings.whisper_model, **kwargs)
    return _whisper_model


def _transcribe_local(audio_b64: str, lang: str) -> dict:
    """Offline ASR via faster-whisper: base64 audio -> temp file -> transcript."""
    try:
        raw = base64.b64decode(audio_b64 or "")
    except Exception:
        raw = b""
    if not raw:
        return {"text": "", "lang": lang}
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
        model = _get_whisper_model()
        segments, _info = model.transcribe(
            tmp_path, language=(lang or settings.whisper_lang_default), beam_size=5)
        text = "".join(seg.text for seg in segments).strip()  # generator is lazy — iterate to run it
        return {"text": text, "lang": lang}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def transcribe(audio_b64: str, lang: str = "ur") -> dict:
    """Speech-to-Text, provider-switched by settings.stt_provider.

    mock  -> deterministic canned transcript (offline; used by the test suite)
    local -> faster-whisper on-device (offline; Urdu / English / Roman-Urdu)
    """
    if settings.stt_provider == "local":
        return _transcribe_local(audio_b64, lang)
    return {"text": "mujhe plumber chahiye ghar par, budget 2000 rupay", "lang": lang}


# ------------------------------------------------------------------ Push (FCM/APNs)
def push(token: str, title: str, body: str, data: dict | None = None) -> dict:
    return {"provider": settings.push_provider, "sent": bool(token)}


# ------------------------------------------------------------------ Maps / Geocoding
_CITY_FIXTURES = {
    "lahore": (31.5204, 74.3587),
    "karachi": (24.8607, 67.0011),
    "islamabad": (33.6844, 73.0479),
    "rawalpindi": (33.5651, 73.0169),
}


def geocode(text: str) -> dict:
    key = (text or "").strip().lower()
    lat, lng = _CITY_FIXTURES.get(key, _CITY_FIXTURES["lahore"])
    return {"lat": lat, "lng": lng, "address": text or "Lahore"}
