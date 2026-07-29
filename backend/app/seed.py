"""Seed reference data: service categories + a default admin user.

Run:  python -m app.seed
"""
import logging

from .core.config import settings
from .core.database import Base, SessionLocal, engine
from .models import ServiceCategory, User

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("seed")

CATEGORIES = [
    ("plumber", "Plumber", "پلمبر", "🔧"),
    ("electrician", "Electrician", "الیکٹریشن", "💡"),
    ("carpenter", "Carpenter", "بڑھئی", "🪚"),
    ("cleaner", "Cleaner", "صفائی", "🧹"),
    ("cook", "Cook", "باورچی", "🍳"),
    ("household", "Household Staff", "گھریلو ملازم", "🏠"),
]


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for key, en, ur, icon in CATEGORIES:
            if not db.query(ServiceCategory).filter(ServiceCategory.key == key).first():
                db.add(ServiceCategory(key=key, name_en=en, name_ur=ur, icon=icon))
        if not db.query(User).filter(User.role == "admin").first():
            db.add(User(phone="03000000000", role="admin", full_name="Platform Admin", status="active"))
            log.info("Created default admin (phone 03000000000).")
        db.commit()
        log.info("Seed complete: %d categories ensured.", len(CATEGORIES))
    finally:
        db.close()


if __name__ == "__main__":
    run()
