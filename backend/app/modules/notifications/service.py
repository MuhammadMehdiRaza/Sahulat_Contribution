"""Internal notification dispatch — used by Booking, Bidding, Matching, etc.

Persists an in-app notification row and best-effort pushes to the user's devices
via the push adapter (mock by default).
"""
from sqlalchemy.orm import Session

from ... import adapters
from ...models import Device, Notification


def notify(db: Session, user_id: str, type_: str, title: str, body: str, data: dict | None = None) -> Notification:
    note = Notification(user_id=user_id, type=type_, title=title, body=body, data=data or {}, channel="in_app")
    db.add(note)
    db.flush()
    for device in db.query(Device).filter(Device.user_id == user_id).all():
        adapters.push(device.push_token, title, body, data)
    return note
