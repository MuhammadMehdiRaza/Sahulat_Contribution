def _booking(client, hirer, worker, method="escrow_easypaisa", price=2000):
    job = client.post("/api/v1/jobs", headers=hirer["headers"], json={
        "category": "plumber", "lat": 31.5, "lng": 74.3, "budget_target": 2000, "budget_max": 3000}).json()
    b = client.post("/api/v1/bookings", headers=hirer["headers"], json={
        "job_id": job["id"], "worker_id": worker["id"], "agreed_price": price, "payment_method": method})
    assert b.status_code == 201, b.text
    return b.json()["id"]


def test_escrow_lifecycle_and_wallet(hirer, verified_worker, client):
    bid = _booking(client, hirer, verified_worker)
    wh = verified_worker["headers"]
    assert client.post(f"/api/v1/bookings/{bid}/confirm", headers=wh).json()["status"] == "confirmed"
    assert client.post(f"/api/v1/bookings/{bid}/start", headers=wh).json()["status"] == "in_progress"
    assert client.post(f"/api/v1/bookings/{bid}/complete", headers=wh, json={}).json()["status"] == "completed"
    wallet = client.get("/api/v1/payments/me/wallet", headers=wh).json()
    assert wallet["balance"] == 1800.0  # 2000 - 10% platform fee


def test_confirm_requires_assigned_worker(hirer, verified_worker, client):
    bid = _booking(client, hirer, verified_worker)
    # hirer cannot confirm (role guard) ...
    assert client.post(f"/api/v1/bookings/{bid}/confirm", headers=hirer["headers"]).status_code == 403


def test_cannot_start_before_confirm(hirer, verified_worker, client):
    bid = _booking(client, hirer, verified_worker)
    assert client.post(f"/api/v1/bookings/{bid}/start", headers=verified_worker["headers"]).status_code == 409


def test_rating_updates_worker_reputation(hirer, verified_worker, client):
    bid = _booking(client, hirer, verified_worker)
    wh = verified_worker["headers"]
    client.post(f"/api/v1/bookings/{bid}/confirm", headers=wh)
    client.post(f"/api/v1/bookings/{bid}/start", headers=wh)
    client.post(f"/api/v1/bookings/{bid}/complete", headers=wh, json={})
    r = client.post(f"/api/v1/bookings/{bid}/rate", headers=hirer["headers"], json={"stars": 5, "comment": "great"})
    assert r.status_code == 201
    prof = client.get(f"/api/v1/profiles/workers/{verified_worker['id']}", headers=hirer["headers"]).json()
    assert prof["rating_avg"] == 5.0
    assert prof["jobs_completed"] == 1


def test_cancel_refunds_escrow(hirer, verified_worker, client):
    bid = _booking(client, hirer, verified_worker)
    client.post(f"/api/v1/bookings/{bid}/confirm", headers=verified_worker["headers"])  # holds escrow
    r = client.post(f"/api/v1/bookings/{bid}/cancel", headers=hirer["headers"], json={"reason": "changed mind"})
    assert r.json()["status"] == "cancelled"
    tx = client.get(f"/api/v1/payments/bookings/{bid}/transactions", headers=hirer["headers"]).json()
    assert any(t["type"] == "refund" for t in tx)
