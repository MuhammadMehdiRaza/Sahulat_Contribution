"""PAYMENT service — escrow hold/release, COD fee, refunds, wallet + ledger.

FR-PAY-01 (escrow lock), FR-PAY-02 (COD fee + PIN), FR-PAY-03 (settlement/payout).
All money movement is double-entry into ledger_entries and mirrored to payments.
"""
from sqlalchemy.orm import Session

from ... import adapters
from ...models import Booking, LedgerEntry, Payment, Wallet

_PROVIDER = {"escrow_easypaisa": "easypaisa", "escrow_jazzcash": "jazzcash", "cod": "cod"}


def provider_for(method: str) -> str:
    return _PROVIDER.get(method, "easypaisa")


def _credit_wallet(db: Session, user_id: str, amount: float) -> None:
    w = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if w is None:
        w = Wallet(user_id=user_id, balance=0)
        db.add(w)
        db.flush()
    w.balance = round((w.balance or 0) + amount, 2)


def hold_escrow(db: Session, booking: Booking) -> dict:
    provider = provider_for(booking.payment_method)
    res = adapters.escrow_hold(booking.id, provider, booking.agreed_price)
    db.add(Payment(booking_id=booking.id, provider=provider, type="escrow_hold",
                   amount=booking.agreed_price, status="held", provider_ref=res["provider_ref"]))
    db.add(LedgerEntry(booking_id=booking.id, account="escrow", direction="credit",
                       amount=booking.agreed_price, memo="escrow hold"))
    db.flush()
    return res


def release_escrow(db: Session, booking: Booking) -> dict:
    provider = provider_for(booking.payment_method)
    net = round(booking.agreed_price - booking.platform_fee, 2)
    res = adapters.escrow_release(booking.id, provider, booking.agreed_price)
    db.add(Payment(booking_id=booking.id, provider=provider, type="escrow_release",
                   amount=booking.agreed_price, status="released", provider_ref=res["provider_ref"]))
    db.add(LedgerEntry(booking_id=booking.id, account="escrow", direction="debit",
                       amount=booking.agreed_price, memo="escrow release"))
    db.add(LedgerEntry(booking_id=booking.id, account="worker_balance", direction="credit",
                       amount=net, memo="payout"))
    db.add(LedgerEntry(booking_id=booking.id, account="platform", direction="credit",
                       amount=booking.platform_fee, memo="platform fee"))
    _credit_wallet(db, booking.worker_id, net)
    db.flush()
    return {"net_to_worker": net, **res}


def collect_cod_fee(db: Session, booking: Booking) -> dict:
    res = adapters.collect_platform_fee(booking.id, "cod", booking.platform_fee)
    db.add(Payment(booking_id=booking.id, provider="cod", type="platform_fee",
                   amount=booking.platform_fee, status="held", provider_ref=res["provider_ref"]))
    db.add(LedgerEntry(booking_id=booking.id, account="platform", direction="credit",
                       amount=booking.platform_fee, memo="COD platform fee"))
    db.flush()
    return res


def refund_escrow(db: Session, booking: Booking) -> dict:
    provider = provider_for(booking.payment_method)
    res = adapters.refund(booking.id, provider, booking.agreed_price)
    db.add(Payment(booking_id=booking.id, provider=provider, type="refund",
                   amount=booking.agreed_price, status="refunded", provider_ref=res["provider_ref"]))
    db.add(LedgerEntry(booking_id=booking.id, account="escrow", direction="debit",
                       amount=booking.agreed_price, memo="refund to hirer"))
    db.flush()
    return res
