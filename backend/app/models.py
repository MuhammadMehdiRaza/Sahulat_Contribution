"""All ORM models for KaamConnect. UUID string PKs for SQLite+Postgres portability.

Money uses Numeric(12,2) returning float (asdecimal=False) to keep JSON serialization
clean across SQLite and Postgres; production may switch to Decimal.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import mapped_column, relationship

from .core.database import Base


def uid() -> str:
    return str(uuid.uuid4())


def Money(**kw):
    return mapped_column(Numeric(12, 2, asdecimal=False), **kw)


def now() -> datetime:
    return datetime.utcnow()


# --------------------------------------------------------------------------- identity
class User(Base):
    __tablename__ = "users"
    id = mapped_column(String(36), primary_key=True, default=uid)
    phone = mapped_column(String(20), unique=True, index=True, nullable=False)
    username = mapped_column(String(40), unique=True, index=True, nullable=True)
    password_hash = mapped_column(String(128), nullable=True)
    role = mapped_column(String(10), nullable=False)  # hirer | worker | admin (immutable)
    full_name = mapped_column(String(120), default="")
    language = mapped_column(String(10), default="en")  # en | ur | roman_ur
    status = mapped_column(String(16), default="active")  # active | on_hold | suspended
    created_at = mapped_column(DateTime, default=now)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id = mapped_column(String(36), primary_key=True, default=uid)
    phone = mapped_column(String(20), index=True, nullable=False)
    code_hash = mapped_column(String(128), nullable=False)
    channel = mapped_column(String(10), default="sms")
    expires_at = mapped_column(DateTime, nullable=False)
    consumed_at = mapped_column(DateTime, nullable=True)
    attempts = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime, default=now)


class Device(Base):
    __tablename__ = "devices"
    id = mapped_column(String(36), primary_key=True, default=uid)
    user_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    push_token = mapped_column(String(255), nullable=False)
    platform = mapped_column(String(10), default="android")
    created_at = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------- profiles
class WorkerProfile(Base):
    __tablename__ = "worker_profiles"
    id = mapped_column(String(36), primary_key=True, default=uid)
    user_id = mapped_column(String(36), ForeignKey("users.id"), unique=True, index=True)
    skills = mapped_column(JSON, default=list)             # list of category keys
    bio = mapped_column(Text, default="")
    base_lat = mapped_column(Float, nullable=True)
    base_lng = mapped_column(Float, nullable=True)
    service_radius_km = mapped_column(Integer, default=10)
    availability = mapped_column(String(10), default="offline")  # available | busy | offline
    rate_min = Money(nullable=True)
    rate_target = Money(nullable=True)
    badge_cnic = mapped_column(Boolean, default=False)
    badge_police = mapped_column(Boolean, default=False)
    badge_skill = mapped_column(Boolean, default=False)
    rating_avg = mapped_column(Float, default=0.0)
    rating_count = mapped_column(Integer, default=0)
    jobs_completed = mapped_column(Integer, default=0)
    total_earnings = Money(default=0)
    created_at = mapped_column(DateTime, default=now)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)


class HirerProfile(Base):
    __tablename__ = "hirer_profiles"
    id = mapped_column(String(36), primary_key=True, default=uid)
    user_id = mapped_column(String(36), ForeignKey("users.id"), unique=True, index=True)
    default_lat = mapped_column(Float, nullable=True)
    default_lng = mapped_column(Float, nullable=True)
    address = mapped_column(String(255), default="")
    rating_avg = mapped_column(Float, default=0.0)
    rating_count = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime, default=now)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)


class Rating(Base):
    __tablename__ = "ratings"
    id = mapped_column(String(36), primary_key=True, default=uid)
    booking_id = mapped_column(String(36), ForeignKey("bookings.id"), index=True)
    rater_id = mapped_column(String(36), ForeignKey("users.id"))
    ratee_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    stars = mapped_column(Integer, nullable=False)
    comment = mapped_column(Text, default="")
    created_at = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------- kyc
class KycVerification(Base):
    __tablename__ = "kyc_verifications"
    id = mapped_column(String(36), primary_key=True, default=uid)
    user_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    cnic = mapped_column(String(20))
    full_name = mapped_column(String(120))
    dob = mapped_column(String(20))
    card_issue_date = mapped_column(String(20))
    demographic_match = mapped_column(Boolean, default=False)
    biometric_score = mapped_column(Float, default=0.0)
    status = mapped_column(String(16), default="pending")  # pending|verified|rejected|manual_review
    provider_ref = mapped_column(String(64), default="")
    created_at = mapped_column(DateTime, default=now)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)


# --------------------------------------------------------------------------- jobs / matching
class ServiceCategory(Base):
    __tablename__ = "service_categories"
    id = mapped_column(String(36), primary_key=True, default=uid)
    key = mapped_column(String(40), unique=True, index=True)
    name_en = mapped_column(String(60))
    name_ur = mapped_column(String(60))
    icon = mapped_column(String(10), default="")


class Job(Base):
    __tablename__ = "jobs"
    id = mapped_column(String(36), primary_key=True, default=uid)
    hirer_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    category = mapped_column(String(40), index=True)
    description = mapped_column(Text, default="")
    lat = mapped_column(Float, nullable=True)
    lng = mapped_column(Float, nullable=True)
    address = mapped_column(String(255), default="")
    budget_target = Money(nullable=True)
    budget_max = Money(nullable=True)
    is_emergency = mapped_column(Boolean, default=False)
    status = mapped_column(String(16), default="posted")
    scheduled_for = mapped_column(DateTime, nullable=True)
    deadline = mapped_column(DateTime, nullable=True)  # complete-by time; lapses -> auto-cancel
    created_at = mapped_column(DateTime, default=now)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)


class WorkerLocation(Base):
    __tablename__ = "worker_locations"
    id = mapped_column(String(36), primary_key=True, default=uid)
    worker_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    lat = mapped_column(Float, nullable=False)
    lng = mapped_column(Float, nullable=False)
    recorded_at = mapped_column(DateTime, default=now)


class JobInterest(Base):
    """A worker expressing interest ('I'm interested') in an open posted job.

    The hirer reviews interested workers and starts AI negotiation / chat from there.
    """
    __tablename__ = "job_interests"
    id = mapped_column(String(36), primary_key=True, default=uid)
    job_id = mapped_column(String(36), ForeignKey("jobs.id"), index=True)
    worker_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    message = mapped_column(Text, default="")
    status = mapped_column(String(16), default="interested")  # interested | shortlisted | dismissed
    created_at = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------- bidding
class NegotiationSession(Base):
    __tablename__ = "negotiation_sessions"
    id = mapped_column(String(36), primary_key=True, default=uid)
    job_id = mapped_column(String(36), ForeignKey("jobs.id"), index=True)
    hirer_id = mapped_column(String(36), ForeignKey("users.id"))
    worker_id = mapped_column(String(36), ForeignKey("users.id"))
    hirer_target = Money()
    hirer_max = Money()
    worker_min = Money()
    worker_target = Money()
    kappa_hirer = mapped_column(Float)
    kappa_worker = mapped_column(Float)
    max_rounds = mapped_column(Integer, default=5)
    current_round = mapped_column(Integer, default=0)
    status = mapped_column(String(12), default="active")  # active|agreed|failed|cancelled
    final_price = Money(nullable=True)
    created_at = mapped_column(DateTime, default=now)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)
    rounds = relationship("BidRound", cascade="all, delete-orphan", backref="session")


class BidRound(Base):
    __tablename__ = "bid_rounds"
    id = mapped_column(String(36), primary_key=True, default=uid)
    session_id = mapped_column(String(36), ForeignKey("negotiation_sessions.id"), index=True)
    round_no = mapped_column(Integer, nullable=False)
    hirer_offer = Money()
    worker_offer = Money()
    gap = Money()
    converged = mapped_column(Boolean, default=False)
    hirer_message = mapped_column(Text, nullable=True)
    worker_message = mapped_column(Text, nullable=True)
    reasoning = mapped_column(Text, nullable=True)
    created_at = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------- booking / payment
class Booking(Base):
    __tablename__ = "bookings"
    id = mapped_column(String(36), primary_key=True, default=uid)
    job_id = mapped_column(String(36), ForeignKey("jobs.id"), index=True)
    hirer_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    worker_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    session_id = mapped_column(String(36), ForeignKey("negotiation_sessions.id"), nullable=True)
    agreed_price = Money()
    platform_fee = Money(default=0)
    payment_method = mapped_column(String(20), default="escrow_easypaisa")
    status = mapped_column(String(16), default="pending_approval")
    release_pin_hash = mapped_column(String(128), nullable=True)
    started_at = mapped_column(DateTime, nullable=True)
    completed_at = mapped_column(DateTime, nullable=True)
    created_at = mapped_column(DateTime, default=now)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)


class Payment(Base):
    __tablename__ = "payments"
    id = mapped_column(String(36), primary_key=True, default=uid)
    booking_id = mapped_column(String(36), ForeignKey("bookings.id"), index=True)
    provider = mapped_column(String(20))
    type = mapped_column(String(20))   # escrow_hold|escrow_release|platform_fee|refund|payout
    amount = Money()
    status = mapped_column(String(16))  # initiated|held|released|failed|refunded
    provider_ref = mapped_column(String(64), default="")
    created_at = mapped_column(DateTime, default=now)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id = mapped_column(String(36), primary_key=True, default=uid)
    booking_id = mapped_column(String(36), ForeignKey("bookings.id"), nullable=True, index=True)
    account = mapped_column(String(20))    # platform | worker_balance | escrow
    direction = mapped_column(String(6))   # debit | credit
    amount = Money()
    memo = mapped_column(String(120), default="")
    created_at = mapped_column(DateTime, default=now)


class Wallet(Base):
    __tablename__ = "wallets"
    id = mapped_column(String(36), primary_key=True, default=uid)
    user_id = mapped_column(String(36), ForeignKey("users.id"), unique=True, index=True)
    balance = Money(default=0)
    updated_at = mapped_column(DateTime, default=now, onupdate=now)


class WalletTxn(Base):
    """Per-user wallet history: welcome bonus, top-ups, escrow holds, refunds, payouts."""
    __tablename__ = "wallet_txns"
    id = mapped_column(String(36), primary_key=True, default=uid)
    user_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    amount = Money()
    direction = mapped_column(String(6))   # credit | debit
    type = mapped_column(String(16))        # bonus | topup | hold | refund | payout
    memo = mapped_column(String(120), default="")
    booking_id = mapped_column(String(36), ForeignKey("bookings.id"), nullable=True)
    created_at = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------- chat / notifications
class ChatThread(Base):
    __tablename__ = "chat_threads"
    id = mapped_column(String(36), primary_key=True, default=uid)
    booking_id = mapped_column(String(36), ForeignKey("bookings.id"), nullable=True)
    job_id = mapped_column(String(36), ForeignKey("jobs.id"), nullable=True)
    hirer_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    worker_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    created_at = mapped_column(DateTime, default=now)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = mapped_column(String(36), primary_key=True, default=uid)
    thread_id = mapped_column(String(36), ForeignKey("chat_threads.id"), index=True)
    sender_id = mapped_column(String(36), ForeignKey("users.id"))
    type = mapped_column(String(10), default="text")  # text | voice
    body = mapped_column(Text, default="")
    voice_url = mapped_column(String(255), nullable=True)
    transcript = mapped_column(Text, nullable=True)
    lang = mapped_column(String(10), default="en")
    created_at = mapped_column(DateTime, default=now)


class PriceOffer(Base):
    """A manual price offer inside a chat thread. Either party can propose/counter;
    the *other* party accepts, which locks the price (no further changes)."""
    __tablename__ = "price_offers"
    id = mapped_column(String(36), primary_key=True, default=uid)
    thread_id = mapped_column(String(36), ForeignKey("chat_threads.id"), index=True)
    amount = Money()
    proposed_by = mapped_column(String(36), ForeignKey("users.id"))
    status = mapped_column(String(12), default="pending")  # pending | accepted
    created_at = mapped_column(DateTime, default=now)


class Notification(Base):
    __tablename__ = "notifications"
    id = mapped_column(String(36), primary_key=True, default=uid)
    user_id = mapped_column(String(36), ForeignKey("users.id"), index=True)
    type = mapped_column(String(40))
    title = mapped_column(String(120))
    body = mapped_column(Text, default="")
    data = mapped_column(JSON, default=dict)
    channel = mapped_column(String(10), default="in_app")
    read_at = mapped_column(DateTime, nullable=True)
    created_at = mapped_column(DateTime, default=now)
