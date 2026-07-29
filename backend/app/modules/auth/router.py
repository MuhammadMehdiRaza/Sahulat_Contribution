"""AUTH module — OTP onboarding, JWT sessions, language/role persistence.

FR-AUTH-01 (language), FR-AUTH-02 (role routing), FR-AUTH-03 (4-digit OTP, 180s).
"""
from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ... import adapters
from ...core.config import settings
from ...core.database import get_db
from ...core.deps import get_current_user
from ...core.security import create_access_token, generate_otp, hash_secret, verify_secret
from ...models import HirerProfile, OtpCode, User, Wallet, WorkerProfile

router = APIRouter(prefix="/auth", tags=["auth"])

Language = Literal["en", "ur", "roman_ur"]
Role = Literal["hirer", "worker"]


# -------------------------------------------------------------------- schemas
class OtpRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    channel: Literal["sms", "whatsapp"] = "sms"


class OtpRequestOut(BaseModel):
    request_id: str
    expires_in: int
    debug_code: Optional[str] = None  # dev only


class VerifyRequest(BaseModel):
    phone: str
    code: str
    role: Optional[Role] = None
    full_name: Optional[str] = None
    language: Optional[Language] = None


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=4, max_length=128)
    full_name: str = Field(min_length=1)
    phone: str = Field(min_length=6, max_length=20)
    role: Role
    language: Optional[Language] = None


class LoginRequest(BaseModel):
    username: str
    password: str
    phone: str


class LoginVerifyRequest(BaseModel):
    phone: str
    code: str


class ForgotStartRequest(BaseModel):
    username: str


class ForgotResetRequest(BaseModel):
    username: str
    code: str
    new_password: str = Field(min_length=4, max_length=128)


class UserOut(BaseModel):
    id: str
    phone: str
    username: Optional[str] = None
    role: str
    full_name: str
    language: str
    status: str
    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    created: bool


class LanguageIn(BaseModel):
    language: Language


# -------------------------------------------------------------------- endpoints
@router.post("/otp/request", response_model=OtpRequestOut)
def request_otp(payload: OtpRequest, db: Session = Depends(get_db)):
    code = generate_otp()
    otp = OtpCode(
        phone=payload.phone,
        code_hash=hash_secret(code),
        channel=payload.channel,
        expires_at=datetime.utcnow() + timedelta(seconds=settings.otp_ttl_seconds),
    )
    db.add(otp)
    db.commit()
    adapters.send_otp(payload.phone, code, payload.channel)
    debug = code if (settings.expose_debug_otp and settings.app_env != "production") else None
    return OtpRequestOut(request_id=otp.id, expires_in=settings.otp_ttl_seconds, debug_code=debug)


@router.post("/verify", response_model=TokenOut)
def verify(payload: VerifyRequest, db: Session = Depends(get_db)):
    otp = (
        db.query(OtpCode)
        .filter(OtpCode.phone == payload.phone, OtpCode.consumed_at.is_(None))
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if otp is None or otp.expires_at < datetime.utcnow():
        raise HTTPException(400, "OTP expired or not requested")
    otp.attempts += 1
    if otp.attempts > 5:
        raise HTTPException(429, "Too many attempts")
    if not verify_secret(payload.code, otp.code_hash):
        db.commit()
        raise HTTPException(400, "Invalid OTP")
    otp.consumed_at = datetime.utcnow()

    user = db.query(User).filter(User.phone == payload.phone).first()
    created = False
    if user is None:
        if not payload.role or not payload.full_name:
            raise HTTPException(422, "role and full_name are required for a new user")
        user = User(
            phone=payload.phone,
            role=payload.role,
            full_name=payload.full_name,
            language=payload.language or "en",
        )
        db.add(user)
        db.flush()
        # role-specific profile + worker wallet
        if user.role == "worker":
            db.add(WorkerProfile(user_id=user.id))
            db.add(Wallet(user_id=user.id, balance=0))
        else:
            db.add(HirerProfile(user_id=user.id))
        created = True
    elif payload.language:
        user.language = payload.language

    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role)
    return TokenOut(access_token=token, user=UserOut.model_validate(user), created=created)


@router.post("/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(409, "Username already taken")
    if db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(409, "Phone number already registered")
    user = User(
        phone=payload.phone, username=payload.username, password_hash=hash_secret(payload.password),
        role=payload.role, full_name=payload.full_name, language=payload.language or "en", status="active",
    )
    db.add(user)
    db.flush()
    if user.role == "worker":
        db.add(WorkerProfile(user_id=user.id))
        db.add(Wallet(user_id=user.id, balance=0))
    else:
        db.add(HirerProfile(user_id=user.id))
    db.commit()
    return {"ok": True, "username": user.username, "role": user.role}


@router.post("/login", response_model=OtpRequestOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Step 1: verify username+password+phone, then send a login OTP (2-factor)."""
    user = db.query(User).filter(User.username == payload.username).first()
    if user is None or not user.password_hash or not verify_secret(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    if user.phone != payload.phone:
        raise HTTPException(401, "Phone number does not match this account")
    code = generate_otp()
    otp = OtpCode(
        phone=user.phone, code_hash=hash_secret(code), channel="sms",
        expires_at=datetime.utcnow() + timedelta(seconds=settings.otp_ttl_seconds),
    )
    db.add(otp)
    db.commit()
    adapters.send_otp(user.phone, code, "sms")
    debug = code if (settings.expose_debug_otp and settings.app_env != "production") else None
    return OtpRequestOut(request_id=otp.id, expires_in=settings.otp_ttl_seconds, debug_code=debug)


@router.post("/login/verify", response_model=TokenOut)
def login_verify(payload: LoginVerifyRequest, db: Session = Depends(get_db)):
    """Step 2: verify the login OTP and issue the session token."""
    otp = (
        db.query(OtpCode)
        .filter(OtpCode.phone == payload.phone, OtpCode.consumed_at.is_(None))
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if otp is None or otp.expires_at < datetime.utcnow():
        raise HTTPException(400, "OTP expired or not requested")
    otp.attempts += 1
    if not verify_secret(payload.code, otp.code_hash):
        db.commit()
        raise HTTPException(400, "Invalid OTP")
    otp.consumed_at = datetime.utcnow()
    user = db.query(User).filter(User.phone == payload.phone).first()
    if user is None:
        raise HTTPException(404, "Account not found")
    db.commit()
    token = create_access_token(user.id, user.role)
    return TokenOut(access_token=token, user=UserOut.model_validate(user), created=False)


@router.post("/forgot/start", response_model=OtpRequestOut)
def forgot_start(payload: ForgotStartRequest, db: Session = Depends(get_db)):
    """Forgot password step 1: find the account by username, then send a reset OTP."""
    user = db.query(User).filter(User.username == payload.username).first()
    if user is None:
        raise HTTPException(404, "Username not found")
    code = generate_otp()
    otp = OtpCode(
        phone=user.phone, code_hash=hash_secret(code), channel="sms",
        expires_at=datetime.utcnow() + timedelta(seconds=settings.otp_ttl_seconds),
    )
    db.add(otp)
    db.commit()
    adapters.send_otp(user.phone, code, "sms")
    debug = code if (settings.expose_debug_otp and settings.app_env != "production") else None
    return OtpRequestOut(request_id=otp.id, expires_in=settings.otp_ttl_seconds, debug_code=debug)


@router.post("/forgot/reset")
def forgot_reset(payload: ForgotResetRequest, db: Session = Depends(get_db)):
    """Forgot password step 2: verify the OTP and set the new password."""
    user = db.query(User).filter(User.username == payload.username).first()
    if user is None:
        raise HTTPException(404, "Username not found")
    otp = (
        db.query(OtpCode)
        .filter(OtpCode.phone == user.phone, OtpCode.consumed_at.is_(None))
        .order_by(OtpCode.created_at.desc())
        .first()
    )
    if otp is None or otp.expires_at < datetime.utcnow():
        raise HTTPException(400, "OTP expired or not requested")
    otp.attempts += 1
    if not verify_secret(payload.code, otp.code_hash):
        db.commit()
        raise HTTPException(400, "Invalid OTP")
    otp.consumed_at = datetime.utcnow()
    user.password_hash = hash_secret(payload.new_password)
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me/language", response_model=UserOut)
def set_language(payload: LanguageIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.language = payload.language
    db.commit()
    db.refresh(user)
    return user


@router.post("/logout")
def logout(user: User = Depends(get_current_user)):
    # Stateless JWT: client discards the token. Endpoint exists for symmetry/auditing.
    return {"ok": True}
