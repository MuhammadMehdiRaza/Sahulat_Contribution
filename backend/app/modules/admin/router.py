"""ADMIN module — operations & oversight (elevated RBAC).

KYC review + badge assignment, user status management, and platform metrics.
"""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.deps import require_role
from ...models import (Booking, Job, KycVerification, LedgerEntry, User, WorkerProfile)

router = APIRouter(prefix="/admin", tags=["admin"])


class UserOut(BaseModel):
    id: str
    phone: str
    role: str
    full_name: str
    status: str
    model_config = {"from_attributes": True}


class StatusIn(BaseModel):
    status: Literal["active", "on_hold", "suspended"]


class KycReviewIn(BaseModel):
    decision: Literal["verified", "rejected"]
    badges: Optional[List[str]] = None  # subset of: cnic, police, skill


@router.get("/users", response_model=List[UserOut])
def list_users(role: Optional[str] = None, status: Optional[str] = None,
               db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if status:
        q = q.filter(User.status == status)
    return q.order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/status", response_model=UserOut)
def set_user_status(user_id: str, payload: StatusIn, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    user.status = payload.status
    db.commit()
    db.refresh(user)
    return user


@router.get("/kyc/pending")
def pending_kyc(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    rows = db.query(KycVerification).filter(
        KycVerification.status.in_(["pending", "manual_review"])
    ).order_by(KycVerification.created_at.desc()).all()
    return [
        {"id": k.id, "user_id": k.user_id, "full_name": k.full_name, "status": k.status,
         "biometric_score": k.biometric_score, "demographic_match": k.demographic_match}
        for k in rows
    ]


@router.post("/kyc/{user_id}/review")
def review_kyc(user_id: str, payload: KycReviewIn, db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    kyc = db.query(KycVerification).filter(KycVerification.user_id == user_id).order_by(
        KycVerification.created_at.desc()).first()
    if kyc is None:
        raise HTTPException(404, "KYC record not found")
    kyc.status = payload.decision
    user = db.get(User, user_id)
    wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == user_id).first()
    if payload.decision == "verified":
        badges = payload.badges or ["cnic"]
        if wp:
            wp.badge_cnic = wp.badge_cnic or ("cnic" in badges)
            wp.badge_police = wp.badge_police or ("police" in badges)
            wp.badge_skill = wp.badge_skill or ("skill" in badges)
        if user:
            user.status = "active"
    db.commit()
    return {"status": kyc.status, "user_id": user_id}


@router.get("/metrics")
def metrics(db: Session = Depends(get_db), _: User = Depends(require_role("admin"))):
    gmv = db.query(func.coalesce(func.sum(Booking.agreed_price), 0)).filter(Booking.status == "completed").scalar()
    fees = db.query(func.coalesce(func.sum(LedgerEntry.amount), 0)).filter(
        LedgerEntry.account == "platform", LedgerEntry.direction == "credit").scalar()
    return {
        "users": db.query(func.count(User.id)).scalar(),
        "workers": db.query(func.count(User.id)).filter(User.role == "worker").scalar(),
        "hirers": db.query(func.count(User.id)).filter(User.role == "hirer").scalar(),
        "jobs": db.query(func.count(Job.id)).scalar(),
        "bookings": db.query(func.count(Booking.id)).scalar(),
        "completed_bookings": db.query(func.count(Booking.id)).filter(Booking.status == "completed").scalar(),
        "gmv": float(gmv or 0),
        "platform_revenue": float(fees or 0),
    }
