"""PAYMENT module — escrow endpoints, COD fee+PIN, wallet, transactions, webhooks."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.deps import get_current_user, require_role
from ...core.security import generate_pin, hash_secret
from ...models import Booking, LedgerEntry, Payment, User, Wallet
from . import service as pay

router = APIRouter(prefix="/payments", tags=["payment"])


class BookingRef(BaseModel):
    booking_id: str
    provider: Optional[str] = None


class PaymentOut(BaseModel):
    id: str
    booking_id: str
    provider: str
    type: str
    amount: float
    status: str
    provider_ref: str
    model_config = {"from_attributes": True}


def _owned_booking(db: Session, booking_id: str, user: User, roles=("hirer",)) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(404, "Booking not found")
    if user.role != "admin" and user.id not in (booking.hirer_id, booking.worker_id):
        raise HTTPException(403, "Not a participant of this booking")
    return booking


@router.post("/escrow/hold")
def escrow_hold(payload: BookingRef, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    booking = _owned_booking(db, payload.booking_id, user)
    if booking.payment_method == "cod":
        raise HTTPException(409, "COD bookings do not use escrow")
    res = pay.hold_escrow(db, booking)
    db.commit()
    return {"booking_id": booking.id, **res}


@router.post("/escrow/release")
def escrow_release(payload: BookingRef, db: Session = Depends(get_db), user: User = Depends(require_role("admin"))):
    booking = db.get(Booking, payload.booking_id)
    if booking is None:
        raise HTTPException(404, "Booking not found")
    res = pay.release_escrow(db, booking)
    db.commit()
    return {"booking_id": booking.id, **res}


@router.post("/cod/collect-fee")
def cod_collect_fee(payload: BookingRef, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    booking = _owned_booking(db, payload.booking_id, user)
    if booking.hirer_id != user.id:
        raise HTTPException(403, "Only the hirer can collect the COD fee")
    if booking.payment_method != "cod":
        raise HTTPException(409, "Booking is not Cash-on-Delivery")
    pin = generate_pin()
    booking.release_pin_hash = hash_secret(pin)
    res = pay.collect_cod_fee(db, booking)
    db.commit()
    # PIN returned to the hirer once; only its hash is stored.
    return {"platform_fee": booking.platform_fee, "release_pin": pin, "provider_ref": res["provider_ref"]}


@router.get("/me/wallet")
def my_wallet(db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    ledger = (
        db.query(LedgerEntry)
        .join(Booking, Booking.id == LedgerEntry.booking_id)
        .filter(Booking.worker_id == user.id, LedgerEntry.account == "worker_balance")
        .order_by(LedgerEntry.created_at.desc())
        .all()
    )
    return {
        "balance": wallet.balance if wallet else 0,
        "ledger": [{"amount": e.amount, "memo": e.memo, "direction": e.direction} for e in ledger],
    }


@router.get("/bookings/{booking_id}/transactions", response_model=List[PaymentOut])
def transactions(booking_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _owned_booking(db, booking_id, user)
    return db.query(Payment).filter(Payment.booking_id == booking_id).order_by(Payment.created_at).all()


@router.post("/webhooks/{provider}")
def webhook(provider: str, payload: dict):
    # A real integration verifies the provider signature here, then reconciles the payment.
    return {"ok": True, "provider": provider, "received": bool(payload)}
