"""CHAT module — in-app messaging with phone masking + voice transcription.

FR-CHAT-01 (mask phone numbers, route via in-app channel),
FR-CHAT-02 (voice messages transcribed in UR/EN/Roman-UR).
Live delivery over WebSocket; REST for history and sending.
"""
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ... import adapters
from ...core.database import SessionLocal, get_db
from ...core.deps import get_current_user
from ...core.security import decode_token
from ...core.utils import mask_phone_numbers
from ...models import Booking, ChatMessage, ChatThread, Job, PriceOffer, User, WorkerProfile
from ..booking.service import create_booking
from ..notifications.service import notify
from ..payment import service as pay

router = APIRouter(prefix="/chat", tags=["chat"])


# -------------------------------------------------------------------- schemas
class ThreadIn(BaseModel):
    booking_id: Optional[str] = None
    peer_id: Optional[str] = None
    job_id: Optional[str] = None


class ThreadOut(BaseModel):
    id: str
    booking_id: Optional[str]
    job_id: Optional[str] = None
    hirer_id: str
    worker_id: str
    peer_name: str = ""
    category: str = ""
    last_message: Optional[str] = None
    last_at: Optional[str] = None
    model_config = {"from_attributes": True}


class MessageIn(BaseModel):
    type: Literal["text", "voice"] = "text"
    body: Optional[str] = None
    voice_b64: Optional[str] = None
    lang: str = "en"


class MessageOut(BaseModel):
    id: str
    thread_id: str
    sender_id: str
    type: str
    body: str
    transcript: Optional[str]
    lang: str
    created_at: datetime
    model_config = {"from_attributes": True}


class OfferIn(BaseModel):
    amount: float


class OfferOut(BaseModel):
    amount: Optional[float] = None
    status: str = "none"          # none | pending | accepted
    proposed_by: Optional[str] = None
    locked: bool = False
    job_id: Optional[str] = None
    hirer_id: str
    worker_id: str
    peer_name: str = ""           # the other party's name, relative to the caller
    booking_id: Optional[str] = None  # set once a booking exists for this job (stop re-paying)


# -------------------------------------------------------------------- ws manager
class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, thread_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(thread_id, set()).add(ws)

    def disconnect(self, thread_id: str, ws: WebSocket):
        self.rooms.get(thread_id, set()).discard(ws)

    async def broadcast(self, thread_id: str, message: dict):
        for ws in list(self.rooms.get(thread_id, set())):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(thread_id, ws)


manager = ConnectionManager()


# -------------------------------------------------------------------- helpers
def _participant_thread(db: Session, thread_id: str, user: User) -> ChatThread:
    thread = db.get(ChatThread, thread_id)
    if thread is None:
        raise HTTPException(404, "Thread not found")
    if user.id not in (thread.hirer_id, thread.worker_id):
        raise HTTPException(403, "Not a participant")
    return thread


def _thread_out(db: Session, thread: ChatThread, user: User) -> ThreadOut:
    peer_id = thread.worker_id if user.id == thread.hirer_id else thread.hirer_id
    peer = db.get(User, peer_id)
    last = (
        db.query(ChatMessage).filter(ChatMessage.thread_id == thread.id)
        .order_by(ChatMessage.created_at.desc()).first()
    )
    job = db.get(Job, thread.job_id) if thread.job_id else None
    return ThreadOut(
        id=thread.id, booking_id=thread.booking_id, job_id=thread.job_id,
        hirer_id=thread.hirer_id, worker_id=thread.worker_id,
        peer_name=(peer.full_name if peer else ""),
        category=(job.category if job else ""),
        last_message=(last.body if last else None),
        last_at=(last.created_at.isoformat() if last else None),
    )


def _system_msg(db: Session, thread: ChatThread, actor: User, body: str) -> None:
    db.add(ChatMessage(thread_id=thread.id, sender_id=actor.id, type="system", body=body, lang="en"))


def _current_offer(db: Session, thread_id: str) -> Optional[PriceOffer]:
    return (
        db.query(PriceOffer).filter(PriceOffer.thread_id == thread_id)
        .order_by(PriceOffer.created_at.desc()).first()
    )


def _offer_out(db: Session, thread: ChatThread, offer: Optional[PriceOffer], user: User) -> OfferOut:
    peer_id = thread.worker_id if user.id == thread.hirer_id else thread.hirer_id
    peer = db.get(User, peer_id)
    booking_id = None
    if thread.booking_id:  # a booking made from this thread takes priority
        b = db.get(Booking, thread.booking_id)
        if b and b.status != "cancelled":
            booking_id = b.id
    if booking_id is None and thread.job_id:
        b = db.query(Booking).filter(Booking.job_id == thread.job_id, Booking.status != "cancelled").first()
        booking_id = b.id if b else None
    return OfferOut(
        amount=offer.amount if offer else None,
        status=offer.status if offer else "none",
        proposed_by=offer.proposed_by if offer else None,
        locked=bool(offer and offer.status == "accepted"),
        job_id=thread.job_id, hirer_id=thread.hirer_id, worker_id=thread.worker_id,
        peer_name=(peer.full_name if peer else ""), booking_id=booking_id,
    )


# -------------------------------------------------------------------- endpoints
@router.get("/threads", response_model=List[ThreadOut])
def list_threads(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    threads = db.query(ChatThread).filter(
        or_(ChatThread.hirer_id == user.id, ChatThread.worker_id == user.id)
    ).all()
    outs = [_thread_out(db, th, user) for th in threads]
    outs.sort(key=lambda o: o.last_at or "", reverse=True)
    return outs


@router.post("/threads", response_model=ThreadOut, status_code=201)
def create_thread(payload: ThreadIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.booking_id:
        booking = db.get(Booking, payload.booking_id)
        if booking is None or user.id not in (booking.hirer_id, booking.worker_id):
            raise HTTPException(404, "Booking not found")
        existing = db.query(ChatThread).filter(ChatThread.booking_id == booking.id).first()
        if existing:
            return _thread_out(db, existing, user)
        thread = ChatThread(booking_id=booking.id, job_id=booking.job_id,
                            hirer_id=booking.hirer_id, worker_id=booking.worker_id)
    elif payload.peer_id:
        peer = db.get(User, payload.peer_id)
        if peer is None:
            raise HTTPException(404, "Peer not found")
        hirer_id = user.id if user.role == "hirer" else peer.id
        worker_id = peer.id if user.role == "hirer" else user.id
        # Scope the conversation to the job: a NEW job with the same person starts a FRESH
        # thread, so a previous (completed) job's price/booking never leaks into it.
        q = db.query(ChatThread).filter(ChatThread.hirer_id == hirer_id, ChatThread.worker_id == worker_id)
        if payload.job_id:
            existing = q.filter(ChatThread.job_id == payload.job_id).first()
        else:
            existing = q.filter(ChatThread.job_id.is_(None), ChatThread.booking_id.is_(None)).first()
        if existing:
            return _thread_out(db, existing, user)
        thread = ChatThread(hirer_id=hirer_id, worker_id=worker_id, job_id=payload.job_id)
    else:
        raise HTTPException(422, "Provide booking_id or peer_id")
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return _thread_out(db, thread, user)


@router.get("/threads/{thread_id}/messages", response_model=List[MessageOut])
def list_messages(thread_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _participant_thread(db, thread_id, user)
    return db.query(ChatMessage).filter(ChatMessage.thread_id == thread_id).order_by(ChatMessage.created_at).all()


@router.post("/threads/{thread_id}/messages", response_model=MessageOut, status_code=201)
def send_message(thread_id: str, payload: MessageIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _participant_thread(db, thread_id, user)
    if payload.type == "voice":
        if not payload.voice_b64:
            raise HTTPException(422, "voice_b64 required for a voice message")
        result = adapters.transcribe(payload.voice_b64, payload.lang)
        transcript = result["text"]
        msg = ChatMessage(thread_id=thread_id, sender_id=user.id, type="voice", voice_url="mock://voice",
                          transcript=transcript, body=mask_phone_numbers(transcript), lang=payload.lang)
    else:
        msg = ChatMessage(thread_id=thread_id, sender_id=user.id, type="text",
                          body=mask_phone_numbers(payload.body or ""), lang=payload.lang)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


# -------------------------------------------------------------------- price negotiation
@router.get("/threads/{thread_id}/offer", response_model=OfferOut)
def get_offer(thread_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    thread = _participant_thread(db, thread_id, user)
    return _offer_out(db, thread, _current_offer(db, thread_id), user)


@router.post("/threads/{thread_id}/offer", response_model=OfferOut, status_code=201)
def make_offer(thread_id: str, payload: OfferIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Propose or counter a price. Blocked once a price is locked (accepted)."""
    thread = _participant_thread(db, thread_id, user)
    current = _current_offer(db, thread_id)
    if current and current.status == "accepted":
        raise HTTPException(409, "The price is already locked and cannot be changed")
    amount = round(payload.amount, 2)
    if amount <= 0:
        raise HTTPException(422, "Amount must be greater than zero")
    offer = PriceOffer(thread_id=thread_id, amount=amount, proposed_by=user.id, status="pending")
    db.add(offer)
    verb = "countered with" if current else "proposed"
    _system_msg(db, thread, user, f"{user.full_name} {verb} PKR {amount}")
    other = thread.worker_id if user.id == thread.hirer_id else thread.hirer_id
    notify(db, other, "price_offer", "New price offer 💰",
           f"{user.full_name} {verb} PKR {amount}. Accept or counter in chat.", {"thread_id": thread_id})
    db.commit()
    return _offer_out(db, thread, offer, user)


@router.post("/threads/{thread_id}/offer/accept", response_model=OfferOut)
def accept_offer(thread_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Accept the other party's latest offer — this locks the price permanently."""
    thread = _participant_thread(db, thread_id, user)
    offer = _current_offer(db, thread_id)
    if offer is None:
        raise HTTPException(404, "There is no price offer to accept yet")
    if offer.status == "accepted":
        raise HTTPException(409, "The price is already locked")
    if offer.proposed_by == user.id:
        raise HTTPException(403, "You can't accept your own offer — wait for the other person")
    offer.status = "accepted"
    _system_msg(db, thread, user, f"{user.full_name} accepted PKR {offer.amount} — price locked ✅")
    other = thread.worker_id if user.id == thread.hirer_id else thread.hirer_id
    notify(db, other, "price_locked", "Price locked ✅",
           f"The final price is PKR {offer.amount}.", {"thread_id": thread_id, "job_id": thread.job_id})
    db.commit()
    return _offer_out(db, thread, offer, user)


class ThreadBookingIn(BaseModel):
    payment_method: Literal["escrow_easypaisa", "escrow_jazzcash", "cod"] = "escrow_easypaisa"


@router.post("/threads/{thread_id}/booking")
def create_thread_booking(thread_id: str, payload: ThreadBookingIn, db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    """Book the locked price from a chat — IDEMPOTENT: one booking per thread, so tapping
    'Proceed to payment' more than once never creates duplicates."""
    thread = _participant_thread(db, thread_id, user)
    if user.id != thread.hirer_id:
        raise HTTPException(403, "Only the customer can create the booking")
    offer = _current_offer(db, thread_id)
    if offer is None or offer.status != "accepted":
        raise HTTPException(409, "Agree and lock a price in chat first")

    # already booked from this thread → return it, do not create another
    if thread.booking_id:
        existing = db.get(Booking, thread.booking_id)
        if existing and existing.status != "cancelled":
            return {"booking_id": existing.id, "status": existing.status, "already": True}

    # make sure the thread has a job (chats started without one get a minimal job here)
    job = db.get(Job, thread.job_id) if thread.job_id else None
    if job is None:
        wp = db.query(WorkerProfile).filter(WorkerProfile.user_id == thread.worker_id).first()
        category = (wp.skills[0] if wp and wp.skills else "household")
        job = Job(hirer_id=thread.hirer_id, category=category, description="Agreed in chat",
                  budget_target=offer.amount, budget_max=offer.amount, status="posted")
        db.add(job)
        db.flush()
        thread.job_id = job.id

    # a booking may already exist for the job (created elsewhere) — reuse it
    existing_job_booking = db.query(Booking).filter(
        Booking.job_id == job.id, Booking.status != "cancelled").first()
    if existing_job_booking:
        thread.booking_id = existing_job_booking.id
        db.commit()
        return {"booking_id": existing_job_booking.id, "status": existing_job_booking.status, "already": True}

    try:
        booking = create_booking(db, job=job, worker_id=thread.worker_id, agreed_price=offer.amount,
                                 payment_method=payload.payment_method)
    except pay.InsufficientFunds:
        raise HTTPException(402, "Insufficient wallet balance. Please top up your wallet.")
    thread.booking_id = booking.id
    notify(db, thread.worker_id, "booking_offer", "New booking",
           f"You have a new booking for {job.category}.", {"booking_id": booking.id})
    db.commit()
    db.refresh(booking)
    return {"booking_id": booking.id, "status": booking.status, "already": False}


@router.websocket("/threads/{thread_id}/ws")
async def chat_ws(websocket: WebSocket, thread_id: str, token: str = ""):
    try:
        payload = decode_token(token)
    except Exception:
        await websocket.close(code=1008)
        return
    db = SessionLocal()
    try:
        thread = db.get(ChatThread, thread_id)
        user = db.get(User, payload.get("sub"))
        if thread is None or user is None or user.id not in (thread.hirer_id, thread.worker_id):
            await websocket.close(code=1008)
            return
        await manager.connect(thread_id, websocket)
        try:
            while True:
                data = await websocket.receive_json()
                body = mask_phone_numbers(str(data.get("body", "")))
                msg = ChatMessage(thread_id=thread_id, sender_id=user.id, type="text", body=body,
                                  lang=data.get("lang", "en"))
                db.add(msg)
                db.commit()
                db.refresh(msg)
                await manager.broadcast(thread_id, {
                    "id": msg.id, "thread_id": thread_id, "sender_id": user.id,
                    "body": body, "created_at": msg.created_at.isoformat(),
                })
        except WebSocketDisconnect:
            manager.disconnect(thread_id, websocket)
    finally:
        db.close()
