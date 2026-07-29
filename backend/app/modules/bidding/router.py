"""BIDDING module — initialize, run, and resolve AI price negotiations.

FR-BID-01 (init from [target,max]/[min,target]), FR-BID-02 (turn-based, max 5 rounds),
FR-BID-03 (converge within 500 PKR -> midpoint, booking pending approval).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...core.deps import get_current_user, require_role
from ...models import BidRound, Booking, Job, NegotiationSession, User, WorkerProfile
from ..booking.service import create_booking
from ..notifications.service import notify
from .engine import run_negotiation

router = APIRouter(prefix="/bidding", tags=["bidding"])


# -------------------------------------------------------------------- schemas
class StartIn(BaseModel):
    job_id: str
    worker_id: str
    hirer_target: Optional[float] = None
    hirer_max: Optional[float] = None
    worker_min: Optional[float] = None
    worker_target: Optional[float] = None


class RoundOut(BaseModel):
    round_no: int
    hirer_offer: float
    worker_offer: float
    gap: float
    converged: bool
    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: str
    job_id: str
    hirer_id: str
    worker_id: str
    status: str
    final_price: Optional[float]
    current_round: int
    rounds: List[RoundOut]


def _session_out(session: NegotiationSession, rounds: List[BidRound]) -> SessionOut:
    return SessionOut(
        id=session.id, job_id=session.job_id, hirer_id=session.hirer_id, worker_id=session.worker_id,
        status=session.status, final_price=session.final_price, current_round=session.current_round,
        rounds=[RoundOut.model_validate(r) for r in rounds],
    )


# -------------------------------------------------------------------- endpoints
@router.post("/start", response_model=SessionOut)
def start(payload: StartIn, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    job = db.get(Job, payload.job_id)
    if job is None or job.hirer_id != user.id:
        raise HTTPException(404, "Job not found")
    wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == payload.worker_id).first()
    if wp is None:
        raise HTTPException(404, "Worker not found")

    hirer_target = payload.hirer_target if payload.hirer_target is not None else job.budget_target
    hirer_max = payload.hirer_max if payload.hirer_max is not None else job.budget_max
    worker_min = payload.worker_min if payload.worker_min is not None else wp.rate_min
    worker_target = payload.worker_target if payload.worker_target is not None else wp.rate_target
    if None in (hirer_target, hirer_max, worker_min, worker_target):
        raise HTTPException(422, "Missing budget/rate: set them on the job/worker profile or pass overrides")

    session = NegotiationSession(
        job_id=job.id, hirer_id=user.id, worker_id=payload.worker_id,
        hirer_target=hirer_target, hirer_max=hirer_max, worker_min=worker_min, worker_target=worker_target,
        kappa_hirer=settings.bid_kappa_hirer, kappa_worker=settings.bid_kappa_worker,
        max_rounds=settings.bid_max_rounds,
    )
    db.add(session)
    db.flush()

    outcome = run_negotiation(
        hirer_target=hirer_target, hirer_max=hirer_max, worker_min=worker_min, worker_target=worker_target,
        max_rounds=settings.bid_max_rounds, converge_pkr=settings.bid_converge_pkr,
        kappa_hirer=settings.bid_kappa_hirer, kappa_worker=settings.bid_kappa_worker,
    )

    round_rows = []
    for r in outcome["rounds"]:  # append-only audit trail / checkpoint per round
        row = BidRound(session_id=session.id, round_no=r["round_no"], hirer_offer=r["hirer_offer"],
                       worker_offer=r["worker_offer"], gap=r["gap"], converged=r["converged"])
        db.add(row)
        round_rows.append(row)

    session.status = outcome["status"]
    session.final_price = outcome["final_price"]
    session.current_round = outcome["rounds"][-1]["round_no"]
    job.status = "bidding"

    title = "Bid settled" if outcome["status"] == "agreed" else "Bid unsettled"
    body = (f"Agreed at PKR {outcome['final_price']}." if outcome["status"] == "agreed"
            else "No agreement in 5 rounds — adjust price or book manually.")
    notify(db, payload.worker_id, "bid_update", title, body, {"session_id": session.id})
    db.commit()
    db.refresh(session)
    return _session_out(session, round_rows)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    session = db.get(NegotiationSession, session_id)
    if session is None:
        raise HTTPException(404, "Session not found")
    if user.role != "admin" and user.id not in (session.hirer_id, session.worker_id):
        raise HTTPException(403, "Not a participant")
    rounds = db.query(BidRound).filter(BidRound.session_id == session_id).order_by(BidRound.round_no).all()
    return _session_out(session, rounds)


@router.post("/sessions/{session_id}/accept")
def accept(session_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("hirer"))):
    session = db.get(NegotiationSession, session_id)
    if session is None or session.hirer_id != user.id:
        raise HTTPException(404, "Session not found")
    if session.status != "agreed":
        raise HTTPException(409, f"Cannot accept a '{session.status}' session")
    if db.query(Booking).filter(Booking.session_id == session.id).first():
        raise HTTPException(409, "Session already booked")
    job = db.get(Job, session.job_id)
    booking = create_booking(db, job=job, worker_id=session.worker_id, agreed_price=session.final_price,
                             payment_method="escrow_easypaisa", session_id=session.id)
    notify(db, session.worker_id, "booking_offer", "Booking created",
           f"Booking pending your approval at PKR {session.final_price}.", {"booking_id": booking.id})
    db.commit()
    db.refresh(booking)
    return {"booking_id": booking.id, "status": booking.status, "agreed_price": booking.agreed_price}
