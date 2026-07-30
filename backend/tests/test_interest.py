"""Worker 'I'm interested' flow + hirer applicant review + job-posted notification."""


def _job(client, hirer, **over):
    payload = {"category": "plumber", "description": "leak", "lat": 31.5204, "lng": 74.3587,
               "budget_target": 1500, "budget_max": 3000}
    payload.update(over)
    return client.post("/api/v1/jobs", headers=hirer["headers"], json=payload).json()


def test_job_post_notifies_hirer(hirer, client):
    _job(client, hirer)
    notes = client.get("/api/v1/notifications", headers=hirer["headers"]).json()
    assert any(n["type"] == "job_posted" for n in notes)


def test_worker_interest_notifies_hirer_and_is_idempotent(hirer, verified_worker, client):
    job = _job(client, hirer)
    wh = verified_worker["headers"]
    r1 = client.post(f"/api/v1/jobs/{job['id']}/interest", headers=wh, json={"message": "I can help today"})
    assert r1.status_code == 201 and r1.json()["already"] is False
    r2 = client.post(f"/api/v1/jobs/{job['id']}/interest", headers=wh, json={})
    assert r2.json()["already"] is True  # tapping twice does not duplicate

    notes = client.get("/api/v1/notifications", headers=hirer["headers"]).json()
    assert sum(n["type"] == "job_interest" for n in notes) == 1


def test_hirer_sees_applicants_with_distance(hirer, verified_worker, client):
    job = _job(client, hirer)
    client.post(f"/api/v1/jobs/{job['id']}/interest", headers=verified_worker["headers"],
                json={"message": "available now"})
    apps = client.get(f"/api/v1/jobs/{job['id']}/interests", headers=hirer["headers"]).json()
    assert len(apps) == 1
    a = apps[0]
    assert a["worker_id"] == verified_worker["id"]
    assert a["message"] == "available now"
    assert a["distance_km"] is not None and a["distance_km"] < 1
    assert a["badges"]["cnic"] is True


def test_worker_sees_my_interest_flag_on_nearby(hirer, verified_worker, client):
    job = _job(client, hirer)
    wh = verified_worker["headers"]
    before = client.get(f"/api/v1/jobs/nearby?lat=31.5204&lng=74.3587&radius_km=5", headers=wh).json()
    assert before and before[0]["my_interest"] is False
    client.post(f"/api/v1/jobs/{job['id']}/interest", headers=wh, json={})
    after = client.get(f"/api/v1/jobs/nearby?lat=31.5204&lng=74.3587&radius_km=5", headers=wh).json()
    assert after[0]["my_interest"] is True


def test_only_job_owner_lists_interests(hirer, verified_worker, register, client):
    job = _job(client, hirer)
    other = register("03007770007", "hirer", "Other Hirer")
    assert client.get(f"/api/v1/jobs/{job['id']}/interests", headers=other["headers"]).status_code == 404
