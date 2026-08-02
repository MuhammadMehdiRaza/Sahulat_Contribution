"""JOBS module — posting, discovery, and natural-language / voice search.

FR-GEO-03 (emergency flag on jobs), FR-CHAT-03 (extract category/location/budget
from NL queries above a confidence threshold).
"""
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ... import adapters
from ...core.config import settings
from ...core.database import get_db
from ...core.deps import get_current_user, require_role
from ...core.utils import haversine_km
from ...models import Booking, HirerProfile, Job, JobInterest, User, WorkerLocation, WorkerProfile
from ..notifications.service import notify

router = APIRouter(prefix="/jobs", tags=["jobs"])

# category keyword table for NL extraction (English + Roman-Urdu + Urdu-script cues)
_CATEGORY_KEYWORDS = {
    "plumber": ["plumber", "plumbing", "nal", "nalka", "pipe", "leak", "tap", "toti",
                "نلکا", "نل", "پلمبر", "پائپ", "لیک", "ٹونٹی", "ٹوٹی"],
    "electrician": ["electrician", "electric", "bijli", "wiring", "switch", "current", "mistri",
                    "بجلی", "الیکٹریشن", "تار", "سوئچ", "وائرنگ", "کرنٹ", "مستری"],
    "carpenter": ["carpenter", "wood", "lakri", "furniture", "door", "tarkhan",
                  "ترکھان", "بڑھئی", "لکڑی", "فرنیچر", "دروازہ"],
    "cleaner": ["cleaner", "cleaning", "safai", "clean", "jharu",
                "صفائی", "صاف", "کلینر", "جھاڑو"],
    "cook": ["cook", "chef", "khana", "cooking", "bawarchi", "pakana",
             "باورچی", "کھانا", "پکانا", "شیف"],
    "household": ["maid", "househelp", "household", "naukar", "helper", "masi", "mulazim", "khadima",
                  "نوکر", "ملازم", "گھریلو", "میڈ", "ماسی", "خادمہ", "کام والی"],
}
_CITIES = ["lahore", "karachi", "islamabad", "rawalpindi"]
# Urdu-script city names -> canonical English key
_CITY_ALIASES = {
    "لاہور": "lahore", "کراچی": "karachi", "اسلام آباد": "islamabad",
    "اسلام‌آباد": "islamabad", "راولپنڈی": "rawalpindi", "پنڈی": "rawalpindi",
}
# Urdu-Indic (۰-۹) and Arabic-Indic (٠-٩) digits -> ASCII so budgets spoken in Urdu still parse.
_URDU_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


# -------------------------------------------------------------------- schemas
class JobIn(BaseModel):
    category: str
    description: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: str = ""
    budget_target: Optional[float] = None
    budget_max: Optional[float] = None
    is_emergency: bool = False
    scheduled_for: Optional[datetime] = None
    deadline: Optional[datetime] = None


class ExtendIn(BaseModel):
    deadline: datetime


def _to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Store deadlines as naive UTC so they compare cleanly with datetime.utcnow()."""
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


class JobOut(BaseModel):
    id: str
    hirer_id: str
    category: str
    description: str
    lat: Optional[float]
    lng: Optional[float]
    address: str
    budget_target: Optional[float]
    budget_max: Optional[float]
    is_emergency: bool
    status: str
    created_at: Optional[datetime] = None
    deadline: Optional[datetime] = None
    interested_count: Optional[int] = None  # populated for the hirer's own listing
    my_interest: Optional[bool] = None       # populated for a worker (already interested?)
    booking_id: Optional[str] = None         # set once the job has a booking (view status)
    model_config = {"from_attributes": True}


class JobNearbyOut(JobOut):
    distance_km: float


class InterestIn(BaseModel):
    message: str = ""


class ApplicantOut(BaseModel):
    worker_id: str
    full_name: str
    skills: list
    bio: str
    rating_avg: float
    rating_count: int
    jobs_completed: int
    availability: str
    rate_min: Optional[float]
    rate_target: Optional[float]
    badges: dict
    distance_km: Optional[float]
    message: str
    status: str
    interested_at: str


class NlSearchIn(BaseModel):
    query: Optional[str] = None
    voice_b64: Optional[str] = None
    lang: str = "ur"


class NlSearchOut(BaseModel):
    text: str
    category: Optional[str]
    location: Optional[str]
    budget: Optional[float]
    confidence: float


# -------------------------------------------------------------------- helpers
def extract_intent(text: str) -> dict:
    """Rule-based intent extraction — category, location, budget + confidence.

    Accepts English, Roman-Urdu, and Urdu-script input (including Urdu-Indic digits).
    """
    raw = text or ""
    low = raw.lower()
    category = None
    for cat, words in _CATEGORY_KEYWORDS.items():
        if any(w in low for w in words):
            category = cat
            break
    location = next((c for c in _CITIES if c in low), None)
    if location is None:  # Urdu-script city names
        location = next((v for k, v in _CITY_ALIASES.items() if k in raw), None)
    norm = raw.translate(_URDU_DIGITS)  # Urdu digits -> ASCII for the budget regex
    m = re.search(r"(\d{3,6})", norm.replace(",", "").replace("،", ""))
    budget = float(m.group(1)) if m else None
    signals = sum(x is not None for x in (category, budget, location))
    confidence = round(min(1.0, 0.34 * signals + (0.34 if category else 0)), 2)
    return {"category": category, "location": location, "budget": budget, "confidence": confidence}


def _active_booking_id(db: Session, job_id: str) -> Optional[str]:
    b = db.query(Booking).filter(Booking.job_id == job_id).order_by(Booking.created_at.desc()).first()
    return b.id if b else None


def _worker_position(db: Session, worker_id: str, wp: Optional[WorkerProfile]):
    """Latest GPS ping, falling back to the worker's registered base location."""
    ping = (
        db.query(WorkerLocation)
        .filter(WorkerLocation.worker_id == worker_id)
        .order_by(WorkerLocation.recorded_at.desc())
        .first()
    )
    if ping:
        return ping.lat, ping.lng
    if wp and wp.base_lat is not None and wp.base_lng is not None:
        return wp.base_lat, wp.base_lng
    return None


# -------------------------------------------------------------------- endpoints
@router.post("", response_model=JobOut, status_code=201)
def create_job(payload: JobIn, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    lat, lng = payload.lat, payload.lng
    if lat is None or lng is None:
        hp = db.query(HirerProfile).filter(HirerProfile.user_id == user.id).first()
        if hp and hp.default_lat is not None:
            lat, lng = hp.default_lat, hp.default_lng
    job = Job(
        hirer_id=user.id, category=payload.category, description=payload.description,
        lat=lat, lng=lng, address=payload.address, budget_target=payload.budget_target,
        budget_max=payload.budget_max, is_emergency=payload.is_emergency,
        scheduled_for=payload.scheduled_for, deadline=_to_naive_utc(payload.deadline), status="posted",
    )
    db.add(job)
    db.flush()
    # FR-NOTIF: confirm to the hirer that their job is live (emergency dispatch has its own flow).
    if not payload.is_emergency:
        notify(db, user.id, "job_posted", "Job posted ✅",
               f"Your {payload.category} job is now live. We'll alert you when workers show interest.",
               {"job_id": job.id})
    db.commit()
    db.refresh(job)
    return job


@router.get("", response_model=List[JobOut])
def list_jobs(status: Optional[str] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Job)
    if user.role == "hirer":
        q = q.filter(Job.hirer_id == user.id)
    else:  # workers see the open marketplace
        q = q.filter(Job.status == "posted")
    if status:
        q = q.filter(Job.status == status)
    jobs = q.order_by(Job.created_at.desc()).all()
    if user.role == "hirer":  # annotate each job with interest count + its booking (if any)
        out = []
        for j in jobs:
            jo = JobOut.model_validate(j)
            jo.interested_count = db.query(JobInterest).filter(JobInterest.job_id == j.id).count()
            jo.booking_id = _active_booking_id(db, j.id)
            out.append(jo)
        return out
    return jobs


@router.get("/nearby", response_model=List[JobNearbyOut])
def nearby_jobs(
    lat: float = Query(...), lng: float = Query(...),
    radius_km: float = Query(default=None), category: Optional[str] = None,
    db: Session = Depends(get_db), user: User = Depends(require_role("worker")),
):
    radius = radius_km or settings.match_default_radius_km
    q = db.query(Job).filter(Job.status == "posted", Job.lat.isnot(None))
    if category:
        q = q.filter(Job.category == category)
    applied = {ji.job_id for ji in db.query(JobInterest).filter(JobInterest.worker_id == user.id).all()}
    out = []
    for job in q.all():
        d = haversine_km(lat, lng, job.lat, job.lng)
        if d <= radius:
            base = JobOut.model_validate(job).model_dump()
            base["my_interest"] = job.id in applied
            out.append(JobNearbyOut(**base, distance_km=round(d, 2)))
    out.sort(key=lambda j: j.distance_km)
    return out


@router.post("/search/nl", response_model=NlSearchOut)
def nl_search(payload: NlSearchIn, _: User = Depends(require_role("hirer"))):
    if payload.voice_b64:
        text = adapters.transcribe(payload.voice_b64, payload.lang)["text"]
    elif payload.query:
        text = payload.query
    else:
        raise HTTPException(422, "Provide query or voice_b64")
    intent = extract_intent(text)
    return NlSearchOut(text=text, **intent)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    jo = JobOut.model_validate(job)
    if user.role == "worker":
        jo.my_interest = db.query(JobInterest).filter(
            JobInterest.job_id == job.id, JobInterest.worker_id == user.id).first() is not None
    elif user.role == "hirer" and job.hirer_id == user.id:
        jo.interested_count = db.query(JobInterest).filter(JobInterest.job_id == job.id).count()
        jo.booking_id = _active_booking_id(db, job.id)
    return jo


@router.patch("/{job_id}/cancel", response_model=JobOut)
def cancel_job(job_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    job = db.get(Job, job_id)
    if job is None or job.hirer_id != user.id:
        raise HTTPException(404, "Job not found")
    if job.status in ("completed", "cancelled"):
        raise HTTPException(409, f"Cannot cancel a {job.status} job")
    job.status = "cancelled"
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/interest", status_code=201)
def express_interest(job_id: str, payload: InterestIn, db: Session = Depends(get_db),
                     user: User = Depends(require_role("worker"))):
    """A worker taps 'I'm interested' on an open job; the hirer is notified."""
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    if job.status not in ("posted", "bidding"):
        raise HTTPException(409, f"This job is no longer open ({job.status})")
    existing = db.query(JobInterest).filter(
        JobInterest.job_id == job_id, JobInterest.worker_id == user.id).first()
    if existing:  # idempotent — tapping twice is fine
        return {"ok": True, "already": True, "interest_id": existing.id}
    ji = JobInterest(job_id=job_id, worker_id=user.id, message=(payload.message or "")[:500])
    db.add(ji)
    db.flush()
    notify(db, job.hirer_id, "job_interest", "A worker is interested 👷",
           f"{user.full_name} is interested in your {job.category} job. Tap to view their profile.",
           {"job_id": job.id, "worker_id": user.id})
    db.commit()
    return {"ok": True, "already": False, "interest_id": ji.id}


@router.post("/{job_id}/extend", response_model=JobOut)
def extend_deadline(job_id: str, payload: ExtendIn, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    """The customer extends the job's deadline (must move it further into the future)."""
    job = db.get(Job, job_id)
    if job is None or job.hirer_id != user.id:
        raise HTTPException(404, "Job not found")
    if job.status in ("completed", "cancelled"):
        raise HTTPException(409, f"Cannot extend a {job.status} job")
    new_deadline = _to_naive_utc(payload.deadline)
    if new_deadline is None or new_deadline <= datetime.utcnow():
        raise HTTPException(422, "New deadline must be in the future")
    if job.deadline and new_deadline <= job.deadline:
        raise HTTPException(422, "New deadline must be later than the current one")
    job.deadline = new_deadline
    # let the assigned worker (if any) know the deadline moved
    booking = db.query(Booking).filter(Booking.job_id == job.id, Booking.status != "cancelled").first()
    if booking:
        notify(db, booking.worker_id, "deadline_extended", "Deadline extended",
               f"The customer extended the deadline for the {job.category} job.", {"booking_id": booking.id})
    db.commit()
    db.refresh(job)
    return JobOut.model_validate(job)


@router.get("/{job_id}/interests", response_model=List[ApplicantOut])
def list_interests(job_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    """The hirer reviews every worker who expressed interest in their job."""
    job = db.get(Job, job_id)
    if job is None or job.hirer_id != user.id:
        raise HTTPException(404, "Job not found")
    rows = db.query(JobInterest).filter(JobInterest.job_id == job_id).order_by(JobInterest.created_at).all()
    out: List[ApplicantOut] = []
    for ji in rows:
        wu = db.get(User, ji.worker_id)
        wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == ji.worker_id).first()
        if wu is None or wp is None:
            continue
        dist = None
        if job.lat is not None and job.lng is not None:
            pos = _worker_position(db, ji.worker_id, wp)
            if pos is not None:
                dist = round(haversine_km(job.lat, job.lng, pos[0], pos[1]), 2)
        out.append(ApplicantOut(
            worker_id=wu.id, full_name=wu.full_name, skills=wp.skills or [], bio=wp.bio or "",
            rating_avg=wp.rating_avg, rating_count=wp.rating_count, jobs_completed=wp.jobs_completed or 0,
            availability=wp.availability, rate_min=wp.rate_min, rate_target=wp.rate_target,
            badges={"cnic": wp.badge_cnic, "police": wp.badge_police, "skill": wp.badge_skill},
            distance_km=dist, message=ji.message or "", status=ji.status,
            interested_at=ji.created_at.isoformat(),
        ))
    return out
