"""PROFILE module — Hirer/Worker profiles, availability, public profiles, ratings (BO-7)."""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.deps import get_current_user, require_role
from ...models import HirerProfile, Rating, User, WorkerProfile

router = APIRouter(prefix="/profiles", tags=["profile"])


# -------------------------------------------------------------------- schemas
class WorkerProfileIn(BaseModel):
    skills: List[str] = []
    bio: str = ""
    base_lat: Optional[float] = None
    base_lng: Optional[float] = None
    service_radius_km: int = Field(default=10, ge=1, le=15)
    rate_min: Optional[float] = None
    rate_target: Optional[float] = None


class AvailabilityIn(BaseModel):
    availability: Literal["available", "busy", "offline"]


class HirerProfileIn(BaseModel):
    default_lat: Optional[float] = None
    default_lng: Optional[float] = None
    address: str = ""


class WorkerProfileOut(BaseModel):
    user_id: str
    full_name: str
    skills: list
    bio: str
    base_lat: Optional[float]
    base_lng: Optional[float]
    service_radius_km: int
    availability: str
    rate_min: Optional[float]
    rate_target: Optional[float]
    badges: dict
    rating_avg: float
    rating_count: int
    jobs_completed: int


class RatingOut(BaseModel):
    id: str
    booking_id: str
    stars: int
    comment: str
    model_config = {"from_attributes": True}


# -------------------------------------------------------------------- helpers
def _worker_out(user: User, wp: WorkerProfile) -> WorkerProfileOut:
    return WorkerProfileOut(
        user_id=user.id,
        full_name=user.full_name,
        skills=wp.skills or [],
        bio=wp.bio or "",
        base_lat=wp.base_lat,
        base_lng=wp.base_lng,
        service_radius_km=wp.service_radius_km,
        availability=wp.availability,
        rate_min=wp.rate_min,
        rate_target=wp.rate_target,
        badges={"cnic": wp.badge_cnic, "police": wp.badge_police, "skill": wp.badge_skill},
        rating_avg=wp.rating_avg,
        rating_count=wp.rating_count,
        jobs_completed=wp.jobs_completed,
    )


def _get_worker_profile(db: Session, user_id: str) -> WorkerProfile:
    wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == user_id).first()
    if wp is None:
        raise HTTPException(404, "Worker profile not found")
    return wp


# -------------------------------------------------------------------- endpoints
@router.get("/me")
def my_profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "worker":
        return _worker_out(user, _get_worker_profile(db, user.id))
    hp = db.query(HirerProfile).filter(HirerProfile.user_id == user.id).first()
    if hp is None:
        raise HTTPException(404, "Hirer profile not found")
    return {
        "user_id": user.id, "full_name": user.full_name,
        "default_lat": hp.default_lat, "default_lng": hp.default_lng,
        "address": hp.address, "rating_avg": hp.rating_avg, "rating_count": hp.rating_count,
    }


@router.put("/me/worker", response_model=WorkerProfileOut)
def update_worker(payload: WorkerProfileIn, db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    wp = _get_worker_profile(db, user.id)
    wp.skills = payload.skills
    wp.bio = payload.bio
    wp.base_lat = payload.base_lat
    wp.base_lng = payload.base_lng
    wp.service_radius_km = payload.service_radius_km
    wp.rate_min = payload.rate_min
    wp.rate_target = payload.rate_target
    db.commit()
    db.refresh(wp)
    return _worker_out(user, wp)


@router.patch("/me/worker/availability", response_model=WorkerProfileOut)
def set_availability(payload: AvailabilityIn, db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    wp = _get_worker_profile(db, user.id)
    wp.availability = payload.availability
    db.commit()
    db.refresh(wp)
    return _worker_out(user, wp)


@router.put("/me/hirer")
def update_hirer(payload: HirerProfileIn, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    hp = db.query(HirerProfile).filter(HirerProfile.user_id == user.id).first()
    if hp is None:
        raise HTTPException(404, "Hirer profile not found")
    hp.default_lat = payload.default_lat
    hp.default_lng = payload.default_lng
    hp.address = payload.address
    db.commit()
    return {"user_id": user.id, "default_lat": hp.default_lat, "default_lng": hp.default_lng, "address": hp.address}


@router.get("/workers/{worker_id}", response_model=WorkerProfileOut)
def public_worker(worker_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    user = db.get(User, worker_id)
    if user is None or user.role != "worker":
        raise HTTPException(404, "Worker not found")
    return _worker_out(user, _get_worker_profile(db, worker_id))


@router.get("/me/ratings", response_model=List[RatingOut])
def my_ratings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Rating).filter(Rating.ratee_id == user.id).order_by(Rating.created_at.desc()).all()
