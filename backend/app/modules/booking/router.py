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
from ...models import Booking, HirerProfile, Job, Rating, User, WorkerProfile
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
    worker_name: str = ""
    hirer_name: str = ""
    category: str = ""
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    deadline: Optional[datetime] = None   # job's complete-by time (auto-cancel if missed)
    rated: bool = False               # has the caller already rated this booking?
    my_rating: Optional[int] = None   # stars the caller gave (if rated)
    model_config = {"from_attributes": True}


# -------------------------------------------------------------------- helpers
def _get_participant_booking(db: Session, booking_id: str, user: User) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(404, "Booking not found")
    if user.role != "admin" and user.id not in (booking.hirer_id, booking.worker_id):
        raise HTTPException(403, "Not a participant of this booking")
    return booking


def _booking_out(db: Session, b: Booking, user: Optional[User] = None) -> BookingOut:
    """Booking + the other party's name + job category + dates, for the bookings UI."""
    worker = db.get(User, b.worker_id)
    hirer = db.get(User, b.hirer_id)
    job = db.get(Job, b.job_id)
    rated, my_rating = False, None
    if user is not None:
        r = db.query(Rating).filter(Rating.booking_id == b.id, Rating.rater_id == user.id).first()
        if r:
            rated, my_rating = True, r.stars
    return BookingOut(
        id=b.id, job_id=b.job_id, hirer_id=b.hirer_id, worker_id=b.worker_id, session_id=b.session_id,
        agreed_price=b.agreed_price, platform_fee=b.platform_fee, payment_method=b.payment_method,
        status=b.status, worker_name=(worker.full_name if worker else ""),
        hirer_name=(hirer.full_name if hirer else ""), category=(job.category if job else ""),
        created_at=b.created_at, started_at=b.started_at, completed_at=b.completed_at,
        deadline=(job.deadline if job else None), rated=rated, my_rating=my_rating,
    )


def _auto_cancel_if_overdue(db: Session, booking: Booking) -> bool:
    """If the job's deadline lapsed while still active, auto-cancel + refund the hirer
    (the worker is NOT paid). Returns True if it cancelled."""
    if booking.status not in ("pending_approval", "confirmed", "in_progress"):
        return False
    job = db.get(Job, booking.job_id)
    if job is None or job.deadline is None or job.deadline >= datetime.utcnow():
        return False
    if booking.payment_method != "cod":
        pay.refund_escrow(db, booking)  # money returns to the hirer's wallet
    booking.status = "cancelled"
    job.status = "cancelled"
    notify(db, booking.hirer_id, "booking_cancelled", "Deadline passed ⏰",
           "Your booking was auto-cancelled and refunded because the deadline passed.", {"booking_id": booking.id})
    notify(db, booking.worker_id, "booking_cancelled", "Deadline passed ⏰",
           "The booking was auto-cancelled because the deadline passed — no payment was made.", {"booking_id": booking.id})
    return True


# -------------------------------------------------------------------- endpoints
@router.post("", response_model=BookingOut, status_code=201)
def create(payload: BookingIn, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    job = db.get(Job, payload.job_id)
    if job is None or job.hirer_id != user.id:
        raise HTTPException(404, "Job not found")
    worker = db.get(User, payload.worker_id)
    if worker is None or worker.role != "worker":
        raise HTTPException(404, "Worker not found")
    # prevent creating a second booking for a job that is already booked
    existing = db.query(Booking).filter(Booking.job_id == job.id, Booking.status != "cancelled").first()
    if existing:
        raise HTTPException(409, "This job already has a booking.")
    try:
        booking = create_booking(
            db, job=job, worker_id=payload.worker_id, agreed_price=payload.agreed_price,
            payment_method=payload.payment_method, session_id=payload.session_id,
        )
    except pay.InsufficientFunds:
        raise HTTPException(402, "Insufficient wallet balance. Please top up your wallet and try again.")
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
    if _auto_cancel_if_overdue(db, booking):
        db.commit()
        raise HTTPException(409, "The deadline for this job has passed; the booking was auto-cancelled.")
    if booking.status != "pending_approval":
        raise HTTPException(409, f"Cannot confirm from status '{booking.status}'")
    booking.status = "confirmed"
    # Funds were already locked from the hirer's wallet when the booking was created.
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
    if _auto_cancel_if_overdue(db, booking):
        db.commit()
        raise HTTPException(409, "The deadline for this job has passed; the booking was auto-cancelled.")
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
    if _auto_cancel_if_overdue(db, booking):
        db.commit()
        raise HTTPException(409, "The deadline has passed; the booking was auto-cancelled and refunded — no payment was made.")
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
    # Escrow is held from the hirer's wallet at booking creation, so ANY non-COD booking
    # (pending_approval or confirmed) must refund the hirer on cancellation.
    if booking.payment_method != "cod":
        pay.refund_escrow(db, booking)  # return held funds to the hirer's wallet
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
    # one review per person per booking (hirer↔worker two-way rating)
    if db.query(Rating).filter(Rating.booking_id == booking.id, Rating.rater_id == user.id).first():
        raise HTTPException(409, "You already rated this booking")
    ratee_id = booking.worker_id if user.id == booking.hirer_id else booking.hirer_id
    rating = Rating(booking_id=booking.id, rater_id=user.id, ratee_id=ratee_id,
                    stars=payload.stars, comment=payload.comment)
    db.add(rating)
    # maintain a running average on the ratee's profile (works for both worker and hirer)
    prof = (db.query(WorkerProfile).filter(WorkerProfile.user_id == ratee_id).first()
            or db.query(HirerProfile).filter(HirerProfile.user_id == ratee_id).first())
    if prof:
        total = prof.rating_avg * prof.rating_count + payload.stars
        prof.rating_count += 1
        prof.rating_avg = round(total / prof.rating_count, 2)
    notify(db, ratee_id, "rating_received", "You received a rating ⭐",
           f"You got {payload.stars}★ for a completed job.", {"booking_id": booking.id})
    db.commit()
    return {"id": rating.id, "ratee_id": ratee_id, "stars": payload.stars}


@router.get("", response_model=List[BookingOut])
def list_bookings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Booking)
    if user.role == "hirer":
        q = q.filter(Booking.hirer_id == user.id)
    elif user.role == "worker":
        q = q.filter(Booking.worker_id == user.id)
    rows = q.order_by(Booking.created_at.desc()).all()
    if any([_auto_cancel_if_overdue(db, b) for b in rows]):  # sweep expired on read
        db.commit()
    return [_booking_out(db, b, user) for b in rows]


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    booking = _get_participant_booking(db, booking_id, user)
    if _auto_cancel_if_overdue(db, booking):
        db.commit()
    return _booking_out(db, booking, user)
