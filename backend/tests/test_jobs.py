def _job(client, hirer, **over):
    payload = {"category": "plumber", "description": "leak", "lat": 31.5204, "lng": 74.3587,
               "budget_target": 1500, "budget_max": 3000}
    payload.update(over)
    return client.post("/api/v1/jobs", headers=hirer["headers"], json=payload)


def test_create_and_list_job(hirer, client):
    r = _job(client, hirer)
    assert r.status_code == 201
    jid = r.json()["id"]
    listed = client.get("/api/v1/jobs", headers=hirer["headers"]).json()
    assert any(j["id"] == jid for j in listed)


def test_nl_search_text(hirer, client):
    r = client.post("/api/v1/jobs/search/nl", headers=hirer["headers"],
                    json={"query": "I need a plumber in Lahore budget 2000"})
    body = r.json()
    assert body["category"] == "plumber"
    assert body["budget"] == 2000.0
    assert body["location"] == "lahore"
    assert body["confidence"] > 0.5


def test_nl_search_voice(hirer, client):
    r = client.post("/api/v1/jobs/search/nl", headers=hirer["headers"],
                    json={"voice_b64": "abc", "lang": "ur"})
    assert r.status_code == 200
    assert r.json()["category"] == "plumber"  # canned transcript mentions plumber + budget


def test_nearby_jobs(hirer, worker, client):
    _job(client, hirer, lat=31.5204, lng=74.3587)
    r = client.get("/api/v1/jobs/nearby?lat=31.5205&lng=74.3588&radius_km=5", headers=worker["headers"])
    assert r.status_code == 200
    assert len(r.json()) >= 1
    assert r.json()[0]["distance_km"] < 1


def test_cancel_job(hirer, client):
    jid = _job(client, hirer).json()["id"]
    r = client.patch(f"/api/v1/jobs/{jid}/cancel", headers=hirer["headers"])
    assert r.json()["status"] == "cancelled"
