def _make_booking_notification(client, hirer, worker):
    job = client.post("/api/v1/jobs", headers=hirer["headers"], json={
        "category": "plumber", "lat": 31.5, "lng": 74.3, "budget_target": 2000, "budget_max": 3000}).json()
    client.post("/api/v1/bookings", headers=hirer["headers"], json={
        "job_id": job["id"], "worker_id": worker["id"], "agreed_price": 2000})


def test_booking_generates_notification(hirer, verified_worker, client):
    _make_booking_notification(client, hirer, verified_worker)
    notes = client.get("/api/v1/notifications", headers=verified_worker["headers"]).json()
    assert any(n["type"] == "booking_offer" for n in notes)


def test_mark_notification_read(hirer, verified_worker, client):
    _make_booking_notification(client, hirer, verified_worker)
    notes = client.get("/api/v1/notifications", headers=verified_worker["headers"]).json()
    nid = notes[0]["id"]
    assert client.post(f"/api/v1/notifications/{nid}/read", headers=verified_worker["headers"]).json()["ok"]
    refreshed = client.get("/api/v1/notifications", headers=verified_worker["headers"]).json()
    assert next(n for n in refreshed if n["id"] == nid)["read_at"] is not None


def test_register_device(worker, client):
    r = client.post("/api/v1/notifications/devices", headers=worker["headers"],
                    json={"push_token": "tok123", "platform": "android"})
    assert r.json()["ok"] is True
