"""BOOKING module — booking lifecycle, escrow/COD orchestration, ratings.

Lifecycle: pending_approval -> confirmed -> in_progress -> completed (+ cancelled/disputed).
Confirmation triggers escrow hold; completion triggers escrow release or COD PIN check.
"""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.deps import get_current_user, require_role
from ...core.security import hash_secret, verify_secret
from ...models import Booking, Job, Rating, User, WorkerProfile
from ..notifications.service import notify
from ..payment import service as pay
from .service import create_booking

router = APIRouter(prefix="/bookings", tags=["booking"])

PaymentMethod = Literal["escrow_easypaisa", "escrow_jazzcash", "cod"]


# -------------------------------------------------------------------- schemas
class BookingIn(BaseModel):
    job_id: str
    worker_id: str
    agreed_price: float
    payment_method: PaymentMethod = "escrow_easypaisa"
    session_id: Optional[str] = None


class CompleteIn(BaseModel):
    pin: Optional[str] = None


class CancelIn(BaseModel):
    reason: str = ""


class RateIn(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: str = ""


class BookingOut(BaseModel):
    id: str
    job_id: str
    hirer_id: str
    worker_id: str
    session_id: Optional[str]
    agreed_price: float
    platform_fee: float
    payment_method: str
    status: str
    model_config = {"from_attributes": True}


# -------------------------------------------------------------------- helpers
def _get_participant_booking(db: Session, booking_id: str, user: User) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(404, "Booking not found")
    if user.role != "admin" and user.id not in (booking.hirer_id, booking.worker_id):
        raise HTTPException(403, "Not a participant of this booking")
    return booking


# -------------------------------------------------------------------- endpoints
@router.post("", response_model=BookingOut, status_code=201)
def create(payload: BookingIn, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    job = db.get(Job, payload.job_id)
    if job is None or job.hirer_id != user.id:
        raise HTTPException(404, "Job not found")
    worker = db.get(User, payload.worker_id)
    if worker is None or worker.role != "worker":
        raise HTTPException(404, "Worker not found")
    booking = create_booking(
        db, job=job, worker_id=payload.worker_id, agreed_price=payload.agreed_price,
        payment_method=payload.payment_method, session_id=payload.session_id,
    )
    notify(db, worker.id, "booking_offer", "New booking", f"You have a new booking for {job.category}.",
           {"booking_id": booking.id})
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/confirm", response_model=BookingOut)
def confirm(booking_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    booking = _get_participant_booking(db, booking_id, user)
    if booking.worker_id != user.id:
        raise HTTPException(403, "Only the assigned worker can confirm")
    if booking.status != "pending_approval":
        raise HTTPException(409, f"Cannot confirm from status '{booking.status}'")
    booking.status = "confirmed"
    if booking.payment_method != "cod":
        pay.hold_escrow(db, booking)  # FR-PAY-01: lock funds before service begins
    notify(db, booking.hirer_id, "booking_confirmed", "Booking confirmed",
           "The worker accepted your booking.", {"booking_id": booking.id})
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/start", response_model=BookingOut)
def start(booking_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    booking = _get_participant_booking(db, booking_id, user)
    if booking.worker_id != user.id:
        raise HTTPException(403, "Only the assigned worker can start")
    if booking.status != "confirmed":
        raise HTTPException(409, f"Cannot start from status '{booking.status}'")
    booking.status = "in_progress"
    booking.started_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/complete", response_model=BookingOut)
def complete(booking_id: str, payload: CompleteIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    booking = _get_participant_booking(db, booking_id, user)
    if booking.status != "in_progress":
        raise HTTPException(409, f"Cannot complete from status '{booking.status}'")

    if booking.payment_method == "cod":
        # FR-PAY-02: worker must enter the one-time PIN the hirer shares.
        if not booking.release_pin_hash:
            raise HTTPException(409, "COD platform fee/PIN not collected yet")
        if not payload.pin or not verify_secret(payload.pin, booking.release_pin_hash):
            raise HTTPException(400, "Invalid release PIN")
    else:
        pay.release_escrow(db, booking)  # FR-PAY-03: release escrow to worker

    booking.status = "completed"
    booking.completed_at = datetime.utcnow()
    net = round(booking.agreed_price - booking.platform_fee, 2)
    wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == booking.worker_id).first()
    if wp:
        wp.jobs_completed = (wp.jobs_completed or 0) + 1
        wp.total_earnings = round((wp.total_earnings or 0) + net, 2)
    job = db.get(Job, booking.job_id)
    if job:
        job.status = "completed"
    notify(db, booking.worker_id, "booking_completed", "Job completed",
           f"Payment of PKR {net} settled.", {"booking_id": booking.id})
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/cancel", response_model=BookingOut)
def cancel(booking_id: str, payload: CancelIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    booking = _get_participant_booking(db, booking_id, user)
    if booking.status not in ("pending_approval", "confirmed"):
        raise HTTPException(409, f"Cannot cancel from status '{booking.status}'")
    if booking.status == "confirmed" and booking.payment_method != "cod":
        pay.refund_escrow(db, booking)  # return held funds to the hirer
    booking.status = "cancelled"
    job = db.get(Job, booking.job_id)
    if job:
        job.status = "cancelled"
    other = booking.worker_id if user.id == booking.hirer_id else booking.hirer_id
    notify(db, other, "booking_cancelled", "Booking cancelled", payload.reason or "The booking was cancelled.",
           {"booking_id": booking.id})
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/rate", status_code=201)
def rate(booking_id: str, payload: RateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    booking = _get_participant_booking(db, booking_id, user)
    if booking.status != "completed":
        raise HTTPException(409, "Can only rate a completed booking")
    ratee_id = booking.worker_id if user.id == booking.hirer_id else booking.hirer_id
    rating = Rating(booking_id=booking.id, rater_id=user.id, ratee_id=ratee_id,
                    stars=payload.stars, comment=payload.comment)
    db.add(rating)
    # maintain running average on the ratee's profile
    wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == ratee_id).first()
    if wp:
        total = wp.rating_avg * wp.rating_count + payload.stars
        wp.rating_count += 1
        wp.rating_avg = round(total / wp.rating_count, 2)
    db.commit()
    return {"id": rating.id, "ratee_id": ratee_id, "stars": payload.stars}


@router.get("", response_model=List[BookingOut])
def list_bookings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Booking)
    if user.role == "hirer":
        q = q.filter(Booking.hirer_id == user.id)
    elif user.role == "worker":
        q = q.filter(Booking.worker_id == user.id)
    return q.order_by(Booking.created_at.desc()).all()


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_participant_booking(db, booking_id, user)
