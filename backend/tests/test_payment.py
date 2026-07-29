def _booking(client, hirer, worker, method):
    job = client.post("/api/v1/jobs", headers=hirer["headers"], json={
        "category": "plumber", "lat": 31.5, "lng": 74.3, "budget_target": 2000, "budget_max": 3000}).json()
    return client.post("/api/v1/bookings", headers=hirer["headers"], json={
        "job_id": job["id"], "worker_id": worker["id"], "agreed_price": 2000, "payment_method": method}).json()["id"]


def test_cod_requires_pin_to_complete(hirer, verified_worker, client):
    bid = _booking(client, hirer, verified_worker, "cod")
    wh = verified_worker["headers"]
    client.post(f"/api/v1/bookings/{bid}/confirm", headers=wh)
    client.post(f"/api/v1/bookings/{bid}/start", headers=wh)
    # cannot complete before the fee/PIN is collected
    assert client.post(f"/api/v1/bookings/{bid}/complete", headers=wh, json={}).status_code == 409
    fee = client.post("/api/v1/payments/cod/collect-fee", headers=hirer["headers"], json={"booking_id": bid})
    assert fee.status_code == 200
    pin = fee.json()["release_pin"]
    assert fee.json()["platform_fee"] == 200.0
    wrong = "000000" if pin != "000000" else "111111"
    assert client.post(f"/api/v1/bookings/{bid}/complete", headers=wh, json={"pin": wrong}).status_code == 400
    ok = client.post(f"/api/v1/bookings/{bid}/complete", headers=wh, json={"pin": pin})
    assert ok.json()["status"] == "completed"


def test_escrow_transactions_recorded(hirer, verified_worker, client):
    bid = _booking(client, hirer, verified_worker, "escrow_easypaisa")
    wh = verified_worker["headers"]
    client.post(f"/api/v1/bookings/{bid}/confirm", headers=wh)
    client.post(f"/api/v1/bookings/{bid}/start", headers=wh)
    client.post(f"/api/v1/bookings/{bid}/complete", headers=wh, json={})
    tx = client.get(f"/api/v1/payments/bookings/{bid}/transactions", headers=hirer["headers"]).json()
    types = {t["type"] for t in tx}
    assert "escrow_hold" in types
    assert "escrow_release" in types


def test_wallet_only_for_worker(hirer, client):
    assert client.get("/api/v1/payments/me/wallet", headers=hirer["headers"]).status_code == 403
