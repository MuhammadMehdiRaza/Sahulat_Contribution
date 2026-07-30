"""Job deadline: set at posting, extendable by the customer, and auto-cancel + refund
(worker unpaid) when it lapses without completion."""
from datetime import datetime, timedelta, timezone


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def _topup(client, u, amt=100000):
    client.post("/api/v1/payments/me/wallet/topup", headers=u["headers"], json={"amount": amt, "provider": "easypaisa"})


def _balance(client, u):
    return client.get("/api/v1/payments/me/wallet", headers=u["headers"]).json()["balance"]


def _job(client, hirer, deadline):
    return client.post("/api/v1/jobs", headers=hirer["headers"], json={
        "category": "plumber", "lat": 31.5204, "lng": 74.3587,
        "budget_target": 2000, "budget_max": 2000, "deadline": deadline}).json()


def _book(client, hirer, worker, job):
    return client.post("/api/v1/bookings", headers=hirer["headers"], json={
        "job_id": job["id"], "worker_id": worker["id"], "agreed_price": 2000,
        "payment_method": "escrow_easypaisa"}).json()["id"]


def test_overdue_booking_auto_cancels_and_refunds_on_read(hirer, verified_worker, client):
    _topup(client, hirer)
    before = _balance(client, hirer)
    job = _job(client, hirer, _iso(datetime.now(timezone.utc) - timedelta(hours=1)))  # already past
    bid = _book(client, hirer, verified_worker, job)
    assert _balance(client, hirer) == before - 2000            # held on creation
    b = client.get(f"/api/v1/bookings/{bid}", headers=hirer["headers"]).json()
    assert b["status"] == "cancelled"                          # auto-cancelled on read
    assert _balance(client, hirer) == before                  # fully refunded — worker unpaid
    assert _balance(client, verified_worker) == 0


def test_worker_cannot_confirm_after_deadline(hirer, verified_worker, client):
    _topup(client, hirer)
    job = _job(client, hirer, _iso(datetime.now(timezone.utc) - timedelta(hours=1)))
    bid = _book(client, hirer, verified_worker, job)
    r = client.post(f"/api/v1/bookings/{bid}/confirm", headers=verified_worker["headers"])
    assert r.status_code == 409                                # deadline passed
    b = client.get(f"/api/v1/bookings/{bid}", headers=hirer["headers"]).json()
    assert b["status"] == "cancelled"


def test_extend_deadline(hirer, verified_worker, client):
    _topup(client, hirer)
    soon = datetime.now(timezone.utc) + timedelta(hours=2)
    later = datetime.now(timezone.utc) + timedelta(days=3)
    job = _job(client, hirer, _iso(soon))
    r = client.post(f"/api/v1/jobs/{job['id']}/extend", headers=hirer["headers"], json={"deadline": _iso(later)})
    assert r.status_code == 200 and r.json()["deadline"] is not None
    # cannot move it earlier / into the past
    bad = client.post(f"/api/v1/jobs/{job['id']}/extend", headers=hirer["headers"],
                      json={"deadline": _iso(datetime.now(timezone.utc) - timedelta(days=1))})
    assert bad.status_code == 422


def test_extending_keeps_booking_alive(hirer, verified_worker, client):
    """Extend before the deadline lapses → the booking survives and can be confirmed."""
    _topup(client, hirer)
    job = _job(client, hirer, _iso(datetime.now(timezone.utc) + timedelta(hours=1)))
    bid = _book(client, hirer, verified_worker, job)
    client.post(f"/api/v1/jobs/{job['id']}/extend", headers=hirer["headers"],
                json={"deadline": _iso(datetime.now(timezone.utc) + timedelta(days=5))})
    r = client.post(f"/api/v1/bookings/{bid}/confirm", headers=verified_worker["headers"])
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
