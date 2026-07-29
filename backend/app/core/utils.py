"""Small shared helpers: phone masking (FR-CHAT-01) and geo distance."""
import math
import re

# Matches Pakistani-style and international phone numbers embedded in free text.
_PHONE_RE = re.compile(r"(\+?\d[\d\s\-]{6,}\d)")


def mask_phone_numbers(text: str) -> str:
    """Replace phone-number-like substrings with a placeholder."""
    if not text:
        return text
    return _PHONE_RE.sub("[contact hidden]", text)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))
