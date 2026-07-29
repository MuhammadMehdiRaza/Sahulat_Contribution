"""KYC module — NADRA/Nishan identity + biometric verification.

FR-KYC-01 (demographic match), FR-KYC-02 (biometric threshold), FR-KYC-03 (badges
set server-side only, never by the client).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ... import adapters
from ...core.config import settings
from ...core.database import get_db
from ...core.deps import require_role
from ...models import KycVerification, User, WorkerProfile

router = APIRouter(prefix="/kyc", tags=["kyc"])


class KycSubmit(BaseModel):
    cnic: str
    full_name: str
    dob: str
    card_issue_date: str
    fingerprint_b64: Optional[str] = None
    portrait_b64: Optional[str] = None


class KycStatusOut(BaseModel):
    status: str
    badges: dict
    biometric_score: float
    demographic_match: bool


def _badges(wp: WorkerProfile) -> dict:
    return {"cnic": wp.badge_cnic, "police": wp.badge_police, "skill": wp.badge_skill}


@router.post("/submit", response_model=KycStatusOut)
def submit(payload: KycSubmit, db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    ident = adapters.verify_identity(payload.cnic, payload.full_name, payload.dob, payload.card_issue_date)
    bio = adapters.verify_biometric(payload.fingerprint_b64, payload.portrait_b64)
    score = bio["score"]

    if not ident["match"]:
        status = "rejected"
    elif score >= settings.biometric_threshold:
        status = "verified"
    else:
        status = "manual_review"

    kyc = KycVerification(
        user_id=user.id, cnic=payload.cnic, full_name=payload.full_name, dob=payload.dob,
        card_issue_date=payload.card_issue_date, demographic_match=ident["match"],
        biometric_score=score, status=status, provider_ref=ident["provider_ref"],
    )
    db.add(kyc)

    wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == user.id).first()
    if status == "verified":
        wp.badge_cnic = True          # badge set ONLY from a successful provider response
        user.status = "active"
    elif status == "manual_review":
        user.status = "on_hold"       # account held pending admin review

    db.commit()
    db.refresh(wp)
    return KycStatusOut(status=status, badges=_badges(wp), biometric_score=score, demographic_match=ident["match"])


@router.get("/status", response_model=KycStatusOut)
def status(db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    kyc = (
        db.query(KycVerification)
        .filter(KycVerification.user_id == user.id)
        .order_by(KycVerification.created_at.desc())
        .first()
    )
    wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == user.id).first()
    if kyc is None:
        return KycStatusOut(status="pending", badges=_badges(wp), biometric_score=0.0, demographic_match=False)
    return KycStatusOut(
        status=kyc.status, badges=_badges(wp),
        biometric_score=kyc.biometric_score, demographic_match=kyc.demographic_match,
    )
