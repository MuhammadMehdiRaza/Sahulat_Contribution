"""JWT sessions + PBKDF2 hashing for OTPs and COD PINs (no native deps)."""
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from .config import settings

_ITER = 100_000


def _pbkdf2(value: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", value.encode(), salt, _ITER)


def hash_secret(value: str) -> str:
    salt = os.urandom(16)
    dk = _pbkdf2(value, salt)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(dk).decode()


def verify_secret(value: str, hashed: str) -> bool:
    try:
        salt_b64, dk_b64 = hashed.split("$")
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
        return hmac.compare_digest(_pbkdf2(value, salt), expected)
    except Exception:
        return False


def generate_otp() -> str:
    return f"{secrets.randbelow(10000):04d}"


def generate_pin() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_min),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
