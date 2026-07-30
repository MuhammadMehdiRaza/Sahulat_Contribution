"""Seed demo data for the frontend demo: categories + verified, located workers + a demo hirer.

Run:  python -m app.demo_seed
Idempotent — safe to run repeatedly. Demo password for all seeded accounts: demo1234
"""
import logging

from .core.database import Base, SessionLocal, engine
from .core.security import hash_secret
from .models import HirerProfile, KycVerification, User, Wallet, WalletTxn, WorkerLocation, WorkerProfile
from .seed import run as seed_reference

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("demo_seed")

DEMO_PASSWORD = "demo1234"

# username, phone, name, skill, rating, jobs, rmin, rtarget, lat, lng
WORKERS = [
    ("ahmed", "03211000001", "Muhammad Ahmed", "plumber", 4.8, 156, 500, 1500, 31.5230, 74.3600),
    ("ali", "03211000002", "Ali Hassan", "electrician", 4.9, 203, 600, 2000, 31.5180, 74.3560),
    ("rizwan", "03211000003", "Rizwan Khan", "carpenter", 4.6, 87, 700, 2500, 31.5300, 74.3650),
    ("imran", "03211000004", "Imran Ahmed", "cleaner", 4.5, 142, 400, 1200, 31.5150, 74.3520),
    ("kamran", "03211000005", "Kamran Shah", "plumber", 4.7, 98, 800, 2400, 31.5250, 74.3540),
]


def run() -> None:
    Base.metadata.create_all(bind=engine)
    seed_reference()
    db = SessionLocal()
    try:
        pwd = hash_secret(DEMO_PASSWORD)
        for username, phone, name, skill, rating, jobs, rmin, rtarget, lat, lng in WORKERS:
            if db.query(User).filter(User.phone == phone).first():
                continue
            u = User(phone=phone, username=username, password_hash=pwd, role="worker",
                     full_name=name, language="en", status="active")
            db.add(u)
            db.flush()
            db.add(WorkerProfile(
                user_id=u.id, skills=[skill], bio=f"Experienced {skill}. Available for home services.",
                base_lat=lat, base_lng=lng, service_radius_km=12, availability="available",
                rate_min=rmin, rate_target=rtarget, badge_cnic=True, badge_police=True, badge_skill=True,
                rating_avg=rating, rating_count=jobs, jobs_completed=jobs,
            ))
            db.add(Wallet(user_id=u.id, balance=0))
            db.add(WorkerLocation(worker_id=u.id, lat=lat, lng=lng))
            db.add(KycVerification(
                user_id=u.id, cnic="3520212345671", full_name=name, dob="1990-01-01",
                card_issue_date="2018-01-01", demographic_match=True, biometric_score=0.92,
                status="verified", provider_ref="NADRA-DEMO",
            ))
            log.info("seeded worker %s (%s)", name, skill)

        # a demo customer/hirer account for testing the real login flow
        if not db.query(User).filter(User.phone == "03007000001").first():
            h = User(phone="03007000001", username="customer", password_hash=pwd, role="hirer",
                     full_name="Demo Customer", language="en", status="active")
            db.add(h)
            db.flush()
            db.add(HirerProfile(user_id=h.id, default_lat=31.5204, default_lng=74.3587, address="Lahore"))
            db.add(Wallet(user_id=h.id, balance=5000))  # demo customer funded to book right away
            db.add(WalletTxn(user_id=h.id, amount=5000, direction="credit", type="bonus", memo="Demo balance"))
            log.info("seeded demo hirer (username=customer)")

        db.commit()
        log.info("Demo seed complete. Login with username=ahmed / customer, password=%s + the account phone.", DEMO_PASSWORD)
    finally:
        db.close()


if __name__ == "__main__":
    run()
