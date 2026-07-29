def _job(client, hirer, **over):
    payload = {"category": "plumber", "lat": 31.5204, "lng": 74.3587,
               "budget_target": 2000, "budget_max": 3000}
    payload.update(over)
    return client.post("/api/v1/jobs", headers=hirer["headers"], json=payload).json()


def test_match_finds_nearby_verified_worker(hirer, verified_worker, client):
    r = client.get("/api/v1/matching/workers?lat=31.5204&lng=74.3587&category=plumber&radius_km=10",
                   headers=hirer["headers"])
    assert r.status_code == 200
    assert any(w["worker_id"] == verified_worker["id"] for w in r.json())


def test_match_excludes_out_of_radius(hirer, verified_worker, client):
    # Karachi coordinates — ~1000 km from the Lahore-based worker
    r = client.get("/api/v1/matching/workers?lat=24.8607&lng=67.0011&category=plumber&radius_km=10",
                   headers=hirer["headers"])
    assert all(w["worker_id"] != verified_worker["id"] for w in r.json())


def test_match_excludes_unavailable(hirer, verified_worker, client):
    client.patch("/api/v1/profiles/me/worker/availability", headers=verified_worker["headers"],
                 json={"availability": "offline"})
    r = client.get("/api/v1/matching/workers?lat=31.5204&lng=74.3587&category=plumber&radius_km=10",
                   headers=hirer["headers"])
    assert all(w["worker_id"] != verified_worker["id"] for w in r.json())


def test_emergency_dispatch_creates_booking(hirer, verified_worker, client):
    job = _job(client, hirer, is_emergency=True)
    r = client.post("/api/v1/matching/emergency", headers=hirer["headers"], json={"job_id": job["id"]})
    assert r.status_code == 200
    assert r.json()["worker"]["worker_id"] == verified_worker["id"]
    assert r.json()["booking"]["status"] == "pending_approval"
