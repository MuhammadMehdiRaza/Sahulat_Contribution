"""MATCHING module — geofenced worker matching, GPS pings, emergency dispatch.

FR-GEO-01 (background GPS ingestion), FR-GEO-02 (5-15 km ranked matching),
FR-GEO-03 (emergency: nearest active worker within 5 km, bypasses bidding).
Uses haversine over the latest known worker location; Redis GEO is the production
drop-in (see plan §2.5) and is not required for correctness.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...core.deps import require_role
from ...core.utils import haversine_km
from ...models import Job, User, WorkerLocation, WorkerProfile
from ..booking.service import create_booking
from ..notifications.service import notify
from ..payment import service as pay

router = APIRouter(prefix="/matching", tags=["matching"])


class LocationPing(BaseModel):
    lat: float
    lng: float


class WorkerMatch(BaseModel):
    worker_id: str
    full_name: str
    skills: list
    rating_avg: float
    jobs_completed: int
    availability: str
    distance_km: float
    score: float


class EmergencyIn(BaseModel):
    job_id: str


def _worker_position(db: Session, wp: WorkerProfile):
    ping = (
        db.query(WorkerLocation)
        .filter(WorkerLocation.worker_id == wp.user_id)
        .order_by(WorkerLocation.recorded_at.desc())
        .first()
    )
    if ping:
        return ping.lat, ping.lng
    if wp.base_lat is not None and wp.base_lng is not None:
        return wp.base_lat, wp.base_lng
    return None


def _candidates(db: Session, lat: float, lng: float, radius: float, category: Optional[str], require_available: bool):
    rows = []
    q = db.query(WorkerProfile, User).join(User, User.id == WorkerProfile.user_id).filter(
        WorkerProfile.badge_cnic.is_(True),  # only NADRA-verified workers are matchable
        User.status == "active",
    )
    for wp, user in q.all():
        if require_available and wp.availability != "available":
            continue
        if category and category not in (wp.skills or []):
            continue
        pos = _worker_position(db, wp)
        if pos is None:
            continue
        dist = haversine_km(lat, lng, pos[0], pos[1])
        if dist > radius:
            continue
        score = round(wp.rating_avg * 10 + (wp.jobs_completed or 0) * 0.1 - dist, 3)
        rows.append((wp, user, round(dist, 2), score))
    # Rank: (1) available workers first, (2) shortest distance, (3) highest rating.
    rows.sort(key=lambda r: (0 if r[0].availability == "available" else 1, r[2], -(r[0].rating_avg or 0)))
    return rows


@router.post("/locations")
def record_location(payload: LocationPing, db: Session = Depends(get_db), user: User = Depends(require_role("worker"))):
    db.add(WorkerLocation(worker_id=user.id, lat=payload.lat, lng=payload.lng))
    db.commit()
    return {"ok": True}


@router.get("/workers", response_model=List[WorkerMatch])
def match_workers(
    lat: float = Query(...), lng: float = Query(...),
    category: Optional[str] = None, radius_km: Optional[float] = None,
    db: Session = Depends(get_db), _: User = Depends(require_role("hirer")),
):
    radius = min(radius_km or settings.match_default_radius_km, settings.match_max_radius_km)
    # Include verified workers in range even if not currently "available" — they rank below
    # available ones (the availability badge tells the customer their status).
    rows = _candidates(db, lat, lng, radius, category, require_available=False)
    return [
        WorkerMatch(
            worker_id=wp.user_id, full_name=user.full_name, skills=wp.skills or [],
            rating_avg=wp.rating_avg, jobs_completed=wp.jobs_completed or 0,
            availability=wp.availability, distance_km=dist, score=score,
        )
        for wp, user, dist, score in rows
    ]


@router.post("/emergency")
def emergency_dispatch(payload: EmergencyIn, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    job = db.get(Job, payload.job_id)
    if job is None or job.hirer_id != user.id:
        raise HTTPException(404, "Job not found")
    if job.lat is None or job.lng is None:
        raise HTTPException(422, "Job has no location")
    rows = _candidates(db, job.lat, job.lng, settings.emergency_radius_km, job.category, require_available=True)
    if not rows:
        raise HTTPException(404, "No active worker within emergency radius")
    wp, worker, dist, _score = rows[0]  # nearest/highest-ranked
    price = job.budget_max or job.budget_target or 0
    try:
        booking = create_booking(db, job=job, worker_id=wp.user_id, agreed_price=price,
                                 payment_method="escrow_easypaisa")
    except pay.InsufficientFunds:
        raise HTTPException(402, "Insufficient wallet balance. Please top up your wallet and try again.")
    notify(db, wp.user_id, "emergency_dispatch", "Emergency job",
           f"You have been dispatched for an emergency {job.category}.", {"booking_id": booking.id})
    db.commit()
    db.refresh(booking)
    return {
        "worker": {"worker_id": wp.user_id, "full_name": worker.full_name, "distance_km": dist},
        "booking": {"id": booking.id, "status": booking.status, "agreed_price": booking.agreed_price},
    }
