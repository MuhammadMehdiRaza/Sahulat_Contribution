"""CHAT module — in-app messaging with phone masking + voice transcription.

FR-CHAT-01 (mask phone numbers, route via in-app channel),
FR-CHAT-02 (voice messages transcribed in UR/EN/Roman-UR).
Live delivery over WebSocket; REST for history and sending.
"""
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
from ...models import Booking, ChatMessage, ChatThread, User

router = APIRouter(prefix="/chat", tags=["chat"])


# -------------------------------------------------------------------- schemas
class ThreadIn(BaseModel):
    booking_id: Optional[str] = None
    peer_id: Optional[str] = None


class ThreadOut(BaseModel):
    id: str
    booking_id: Optional[str]
    hirer_id: str
    worker_id: str
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
    model_config = {"from_attributes": True}


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


# -------------------------------------------------------------------- endpoints
@router.get("/threads", response_model=List[ThreadOut])
def list_threads(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(ChatThread).filter(
        or_(ChatThread.hirer_id == user.id, ChatThread.worker_id == user.id)
    ).all()


@router.post("/threads", response_model=ThreadOut, status_code=201)
def create_thread(payload: ThreadIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.booking_id:
        booking = db.get(Booking, payload.booking_id)
        if booking is None or user.id not in (booking.hirer_id, booking.worker_id):
            raise HTTPException(404, "Booking not found")
        existing = db.query(ChatThread).filter(ChatThread.booking_id == booking.id).first()
        if existing:
            return existing
        thread = ChatThread(booking_id=booking.id, hirer_id=booking.hirer_id, worker_id=booking.worker_id)
    elif payload.peer_id:
        peer = db.get(User, payload.peer_id)
        if peer is None:
            raise HTTPException(404, "Peer not found")
        hirer_id = user.id if user.role == "hirer" else peer.id
        worker_id = peer.id if user.role == "hirer" else user.id
        thread = ChatThread(hirer_id=hirer_id, worker_id=worker_id)
    else:
        raise HTTPException(422, "Provide booking_id or peer_id")
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


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
