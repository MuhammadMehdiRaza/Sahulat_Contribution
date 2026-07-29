"""JOBS module — posting, discovery, and natural-language / voice search.

FR-GEO-03 (emergency flag on jobs), FR-CHAT-03 (extract category/location/budget
from NL queries above a confidence threshold).
"""
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ... import adapters
from ...core.config import settings
from ...core.database import get_db
from ...core.deps import get_current_user, require_role
from ...core.utils import haversine_km
from ...models import HirerProfile, Job, User

router = APIRouter(prefix="/jobs", tags=["jobs"])

# category keyword table for NL extraction (English + Roman-Urdu cues)
_CATEGORY_KEYWORDS = {
    "plumber": ["plumber", "plumbing", "nal", "pipe", "leak"],
    "electrician": ["electrician", "electric", "bijli", "wiring", "switch"],
    "carpenter": ["carpenter", "wood", "lakri", "furniture", "door"],
    "cleaner": ["cleaner", "cleaning", "safai", "clean"],
    "cook": ["cook", "chef", "khana", "cooking"],
    "household": ["maid", "househelp", "household", "naukar", "helper"],
}
_CITIES = ["lahore", "karachi", "islamabad", "rawalpindi"]


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
    model_config = {"from_attributes": True}


class JobNearbyOut(JobOut):
    distance_km: float


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
    """Rule-based intent extraction — category, location, budget + confidence."""
    low = (text or "").lower()
    category = None
    for cat, words in _CATEGORY_KEYWORDS.items():
        if any(w in low for w in words):
            category = cat
            break
    location = next((c for c in _CITIES if c in low), None)
    m = re.search(r"(\d{3,6})", low.replace(",", ""))
    budget = float(m.group(1)) if m else None
    signals = sum(x is not None for x in (category, budget, location))
    confidence = round(min(1.0, 0.34 * signals + (0.34 if category else 0)), 2)
    return {"category": category, "location": location, "budget": budget, "confidence": confidence}


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
        scheduled_for=payload.scheduled_for, status="posted",
    )
    db.add(job)
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
    return q.order_by(Job.created_at.desc()).all()


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
    out = []
    for job in q.all():
        d = haversine_km(lat, lng, job.lat, job.lng)
        if d <= radius:
            base = JobOut.model_validate(job).model_dump()
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
def get_job(job_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


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
