"""PAYMENT service — wallet ↔ escrow, COD fee, refunds, payouts + ledger.

The hirer pays from their in-app wallet: creating an escrow booking debits the wallet into
escrow; completion pays the worker (minus platform fee); cancellation refunds the hirer.
All money movement is double-entry in ledger_entries, mirrored to payments, and each
per-user wallet change is recorded in wallet_txns for the wallet screen.
"""
from sqlalchemy.orm import Session

from ... import adapters
from ...models import Booking, LedgerEntry, Payment, Wallet, WalletTxn

_PROVIDER = {"escrow_easypaisa": "easypaisa", "escrow_jazzcash": "jazzcash", "cod": "cod"}


class InsufficientFunds(Exception):
    """Raised when the hirer's wallet cannot cover an escrow hold."""


def provider_for(method: str) -> str:
    return _PROVIDER.get(method, "easypaisa")


def _wallet(db: Session, user_id: str) -> Wallet:
    w = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if w is None:
        w = Wallet(user_id=user_id, balance=0)
        db.add(w)
        db.flush()
    return w


def _txn(db: Session, user_id: str, amount: float, direction: str, type_: str, memo: str, booking_id=None) -> None:
    db.add(WalletTxn(user_id=user_id, amount=amount, direction=direction, type=type_, memo=memo, booking_id=booking_id))


def credit_wallet(db: Session, user_id: str, amount: float, type_: str, memo: str, booking_id=None) -> None:
    w = _wallet(db, user_id)
    w.balance = round((w.balance or 0) + amount, 2)
    _txn(db, user_id, amount, "credit", type_, memo, booking_id)


def debit_wallet(db: Session, user_id: str, amount: float, type_: str, memo: str, booking_id=None) -> bool:
    w = _wallet(db, user_id)
    if (w.balance or 0) + 1e-6 < amount:
        return False
    w.balance = round((w.balance or 0) - amount, 2)
    _txn(db, user_id, amount, "debit", type_, memo, booking_id)
    return True


def balance_of(db: Session, user_id: str) -> float:
    w = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    return w.balance if w else 0


def topup_wallet(db: Session, user_id: str, amount: float, provider: str) -> dict:
    res = adapters.topup(user_id, provider, amount)
    credit_wallet(db, user_id, amount, "topup", f"Top-up via {provider}")
    db.add(Payment(booking_id=None, provider=provider, type="topup", amount=amount,
                   status=res["status"], provider_ref=res["provider_ref"]))
    db.flush()
    return res


def hold_escrow(db: Session, booking: Booking) -> dict:
    """Move the agreed price from the hirer's wallet into escrow (raises if short)."""
    if not debit_wallet(db, booking.hirer_id, booking.agreed_price, "hold",
                        "Escrow hold for booking", booking.id):
        raise InsufficientFunds()
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
    credit_wallet(db, booking.worker_id, net, "payout", "Payout for completed job", booking.id)
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
    credit_wallet(db, booking.hirer_id, booking.agreed_price, "refund", "Refund for cancelled booking", booking.id)
    db.flush()
    return res
