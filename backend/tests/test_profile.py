def test_worker_profile_update(worker, client):
    r = client.put("/api/v1/profiles/me/worker", headers=worker["headers"], json={
        "skills": ["plumber", "electrician"], "bio": "10 yrs", "base_lat": 31.5,
        "base_lng": 74.3, "service_radius_km": 12, "rate_min": 1000, "rate_target": 2000})
    assert r.status_code == 200
    assert r.json()["skills"] == ["plumber", "electrician"]
    assert r.json()["service_radius_km"] == 12


def test_set_availability(worker, client):
    r = client.patch("/api/v1/profiles/me/worker/availability", headers=worker["headers"],
                     json={"availability": "available"})
    assert r.json()["availability"] == "available"


def test_hirer_profile_update(hirer, client):
    r = client.put("/api/v1/profiles/me/hirer", headers=hirer["headers"],
                   json={"default_lat": 31.5, "default_lng": 74.3, "address": "Lahore"})
    assert r.status_code == 200
    assert r.json()["address"] == "Lahore"


def test_public_worker_profile_shows_badges(hirer, verified_worker, client):
    r = client.get(f"/api/v1/profiles/workers/{verified_worker['id']}", headers=hirer["headers"])
    assert r.status_code == 200
    assert r.json()["badges"]["cnic"] is True


def test_role_guard_on_hirer_endpoint(worker, client):
    r = client.put("/api/v1/profiles/me/hirer", headers=worker["headers"], json={"address": "x"})
    assert r.status_code == 403
