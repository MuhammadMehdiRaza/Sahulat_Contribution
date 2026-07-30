from app.modules.bidding.engine import run_negotiation


def test_engine_converges_within_overlap():
    out = run_negotiation(hirer_target=2000, hirer_max=3000, worker_min=1800, worker_target=2600,
                          max_rounds=5, converge_pkr=500)
    assert out["status"] == "agreed"
    assert out["final_price"] is not None
    assert 1800 <= out["final_price"] <= 3000


def test_engine_immediate_agreement_at_boundary():
    # gap at t=0 is exactly 500 -> settle at midpoint 2250
    out = run_negotiation(hirer_target=2000, hirer_max=3000, worker_min=1500, worker_target=2500,
                          max_rounds=5, converge_pkr=500)
    assert out["status"] == "agreed"
    assert out["final_price"] == 2250.0
    assert out["rounds"][0]["round_no"] == 0


def test_engine_breakdown_when_no_overlap():
    out = run_negotiation(hirer_target=1000, hirer_max=1200, worker_min=3000, worker_target=3500,
                          max_rounds=5, converge_pkr=500)
    assert out["status"] == "failed"
    assert out["final_price"] is None
    assert len(out["rounds"]) == 6  # rounds t=0..5


def test_bidding_start_and_accept(hirer, verified_worker, client):
    client.post("/api/v1/payments/me/wallet/topup", headers=hirer["headers"], json={"amount": 100000, "provider": "easypaisa"})
    job = client.post("/api/v1/jobs", headers=hirer["headers"], json={
        "category": "plumber", "lat": 31.5, "lng": 74.3, "budget_target": 2000, "budget_max": 3000}).json()
    r = client.post("/api/v1/bidding/start", headers=hirer["headers"],
                    json={"job_id": job["id"], "worker_id": verified_worker["id"]})
    assert r.status_code == 200
    body = r.json()
    # worker rate_min=1500 target=2500, hirer target=2000 max=3000 -> agree at 2250
    assert body["status"] == "agreed"
    assert body["final_price"] == 2250.0
    acc = client.post(f"/api/v1/bidding/sessions/{body['id']}/accept", headers=hirer["headers"])
    assert acc.status_code == 200
    assert acc.json()["status"] == "pending_approval"
    assert acc.json()["agreed_price"] == 2250.0


def test_bidding_rounds_are_persisted(hirer, verified_worker, client):
    job = client.post("/api/v1/jobs", headers=hirer["headers"], json={
        "category": "plumber", "lat": 31.5, "lng": 74.3, "budget_target": 2000, "budget_max": 3000}).json()
    sid = client.post("/api/v1/bidding/start", headers=hirer["headers"],
                      json={"job_id": job["id"], "worker_id": verified_worker["id"]}).json()["id"]
    got = client.get(f"/api/v1/bidding/sessions/{sid}", headers=hirer["headers"])
    assert got.status_code == 200
    assert len(got.json()["rounds"]) >= 1
