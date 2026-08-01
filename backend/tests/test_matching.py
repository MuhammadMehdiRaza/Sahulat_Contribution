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


def test_unavailable_worker_still_listed_and_flagged(hirer, verified_worker, client):
    # Verified workers now appear even when offline (ranked BELOW available ones); the
    # availability field tells the customer their status.
    client.patch("/api/v1/profiles/me/worker/availability", headers=verified_worker["headers"],
                 json={"availability": "offline"})
    r = client.get("/api/v1/matching/workers?lat=31.5204&lng=74.3587&category=plumber&radius_km=10",
                   headers=hirer["headers"])
    match = next((w for w in r.json() if w["worker_id"] == verified_worker["id"]), None)
    assert match is not None and match["availability"] == "offline"


def test_available_workers_rank_before_offline(hirer, register, client):
    # two verified plumbers at the same spot: one available, one offline -> available first
    def _verified(phone, avail):
        w = register(phone, "worker", "W")
        h = w["headers"]
        client.post("/api/v1/kyc/submit", headers=h, json={
            "cnic": "3520212345671", "full_name": "W", "dob": "1990-01-01",
            "card_issue_date": "2018-01-01", "fingerprint_b64": "fp", "portrait_b64": "img"})
        client.put("/api/v1/profiles/me/worker", headers=h, json={
            "skills": ["plumber"], "base_lat": 31.5204, "base_lng": 74.3587,
            "service_radius_km": 10, "rate_min": 1500, "rate_target": 2500})
        client.patch("/api/v1/profiles/me/worker/availability", headers=h, json={"availability": avail})
        return w["id"]

    offline_id = _verified("03004440001", "offline")
    available_id = _verified("03004440002", "available")
    r = client.get("/api/v1/matching/workers?lat=31.5204&lng=74.3587&category=plumber&radius_km=10",
                   headers=hirer["headers"]).json()
    order = [w["worker_id"] for w in r]
    assert order.index(available_id) < order.index(offline_id)


def test_emergency_dispatch_creates_booking(hirer, verified_worker, client):
    client.post("/api/v1/payments/me/wallet/topup", headers=hirer["headers"], json={"amount": 100000, "provider": "easypaisa"})
    job = _job(client, hirer, is_emergency=True)
    r = client.post("/api/v1/matching/emergency", headers=hirer["headers"], json={"job_id": job["id"]})
    assert r.status_code == 200
    assert r.json()["worker"]["worker_id"] == verified_worker["id"]
    assert r.json()["booking"]["status"] == "pending_approval"
