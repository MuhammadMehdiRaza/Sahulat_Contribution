"""NOTIFICATIONS module — list/read notifications and register device push tokens."""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.deps import get_current_user
from ...models import Device, Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    data: dict
    read_at: Optional[str] = None
    model_config = {"from_attributes": True}


class DeviceIn(BaseModel):
    push_token: str
    platform: Literal["android", "ios"] = "android"


@router.get("", response_model=List[NotificationOut])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.created_at.desc()).all()
    return [
        NotificationOut(id=n.id, type=n.type, title=n.title, body=n.body, data=n.data or {},
                        read_at=n.read_at.isoformat() if n.read_at else None)
        for n in rows
    ]


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from datetime import datetime
    note = db.get(Notification, notification_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    note.read_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/devices")
def register_device(payload: DeviceIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.query(Device).filter(Device.push_token == payload.push_token).first()
    if existing:
        existing.user_id = user.id
        existing.platform = payload.platform
    else:
        db.add(Device(user_id=user.id, push_token=payload.push_token, platform=payload.platform))
    db.commit()
    return {"ok": True}
