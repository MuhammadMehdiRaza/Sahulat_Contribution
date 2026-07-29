"""BOOKING service — shared booking creation used by Booking, Bidding, Matching."""
from sqlalchemy.orm import Session

from ...core.config import settings
from ...models import Booking, Job


def create_booking(
    db: Session, *, job: Job, worker_id: str, agreed_price: float,
    payment_method: str = "escrow_easypaisa", session_id: str | None = None,
    status: str = "pending_approval",
) -> Booking:
    fee = round((agreed_price or 0) * settings.platform_fee_pct, 2)
    booking = Booking(
        job_id=job.id, hirer_id=job.hirer_id, worker_id=worker_id, session_id=session_id,
        agreed_price=agreed_price, platform_fee=fee, payment_method=payment_method, status=status,
    )
    db.add(booking)
    job.status = "booked"
    db.flush()
    return booking
