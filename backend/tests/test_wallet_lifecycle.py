"""Wallet balance must stay correct through the whole booking lifecycle,
for the customer (hirer) who pays and the worker who gets paid."""


def _topup(client, u, amt):
    client.post("/api/v1/payments/me/wallet/topup", headers=u["headers"], json={"amount": amt, "provider": "easypaisa"})


def _balance(client, u):
    return client.get("/api/v1/payments/me/wallet", headers=u["headers"]).json()["balance"]


def _job(client, hirer, price=2000):
    return client.post("/api/v1/jobs", headers=hirer["headers"], json={
        "category": "plumber", "lat": 31.5204, "lng": 74.3587,
        "budget_target": price, "budget_max": price}).json()


def _book(client, hirer, worker, price=2000, method="escrow_easypaisa"):
    job = _job(client, hirer, price)
    r = client.post("/api/v1/bookings", headers=hirer["headers"], json={
        "job_id": job["id"], "worker_id": worker["id"], "agreed_price": price, "payment_method": method})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_creation_holds_money_from_hirer_wallet(hirer, verified_worker, client):
    _topup(client, hirer, 2000)                       # bonus 1000 + 2000 = 3000
    assert _balance(client, hirer) == 3000
    _book(client, hirer, verified_worker, 2000)
    assert _balance(client, hirer) == 1000            # 2000 held in escrow


def test_cancel_pending_refunds_hirer(hirer, verified_worker, client):
    _topup(client, hirer, 2000)
    bid = _book(client, hirer, verified_worker, 2000)
    assert _balance(client, hirer) == 1000
    # cancel while still pending_approval (worker never confirmed) -> full refund
    r = client.post(f"/api/v1/bookings/{bid}/cancel", headers=hirer["headers"], json={"reason": "changed mind"})
    assert r.json()["status"] == "cancelled"
    assert _balance(client, hirer) == 3000            # money returned


def test_cancel_confirmed_refunds_hirer(hirer, verified_worker, client):
    _topup(client, hirer, 2000)
    bid = _book(client, hirer, verified_worker, 2000)
    client.post(f"/api/v1/bookings/{bid}/confirm", headers=verified_worker["headers"])
    assert _balance(client, hirer) == 1000
    client.post(f"/api/v1/bookings/{bid}/cancel", headers=hirer["headers"], json={"reason": "no show"})
    assert _balance(client, hirer) == 3000            # refunded after confirm too


def test_complete_pays_worker_and_charges_hirer(hirer, verified_worker, client):
    _topup(client, hirer, 2000)
    assert _balance(client, verified_worker) == 0
    bid = _book(client, hirer, verified_worker, 2000)
    wh = verified_worker["headers"]
    client.post(f"/api/v1/bookings/{bid}/confirm", headers=wh)
    client.post(f"/api/v1/bookings/{bid}/start", headers=wh)
    client.post(f"/api/v1/bookings/{bid}/complete", headers=wh, json={})
    assert _balance(client, hirer) == 1000            # hirer stays charged (paid for the job)
    assert _balance(client, verified_worker) == 1800  # worker paid net (2000 - 10% fee)


def test_cod_does_not_touch_wallet(hirer, verified_worker, client):
    _topup(client, hirer, 2000)
    before = _balance(client, hirer)
    bid = _book(client, hirer, verified_worker, 2000, method="cod")
    assert _balance(client, hirer) == before          # COD is cash — nothing held from the wallet
    client.post(f"/api/v1/bookings/{bid}/cancel", headers=hirer["headers"], json={})
    assert _balance(client, hirer) == before          # and nothing to refund


def test_wallet_transactions_are_logged(hirer, verified_worker, client):
    _topup(client, hirer, 2000)
    bid = _book(client, hirer, verified_worker, 2000)
    client.post(f"/api/v1/bookings/{bid}/cancel", headers=hirer["headers"], json={})
    types = [t["type"] for t in client.get("/api/v1/payments/me/wallet", headers=hirer["headers"]).json()["transactions"]]
    assert "bonus" in types and "topup" in types and "hold" in types and "refund" in types
