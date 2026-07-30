def _thread(client, hirer, worker):
    return client.post("/api/v1/chat/threads", headers=hirer["headers"],
                       json={"peer_id": worker["id"]}).json()["id"]


def test_text_message_masks_phone(hirer, verified_worker, client):
    tid = _thread(client, hirer, verified_worker)
    m = client.post(f"/api/v1/chat/threads/{tid}/messages", headers=hirer["headers"],
                    json={"type": "text", "body": "call me 03001234567 please"})
    assert m.status_code == 201
    assert "[contact hidden]" in m.json()["body"]
    assert "03001234567" not in m.json()["body"]


def test_voice_message_transcribed(hirer, verified_worker, client):
    tid = _thread(client, hirer, verified_worker)
    m = client.post(f"/api/v1/chat/threads/{tid}/messages", headers=hirer["headers"],
                    json={"type": "voice", "voice_b64": "abc", "lang": "ur"})
    assert m.json()["type"] == "voice"
    assert m.json()["transcript"]


def test_websocket_live_message(hirer, verified_worker, client):
    tid = _thread(client, hirer, verified_worker)
    with client.websocket_connect(f"/api/v1/chat/threads/{tid}/ws?token={hirer['token']}") as ws:
        ws.send_json({"body": "reach me at 03009998887"})
        data = ws.receive_json()
        assert "[contact hidden]" in data["body"]
        assert "03009998887" not in data["body"]


def test_non_participant_cannot_read(hirer, verified_worker, register, client):
    tid = _thread(client, hirer, verified_worker)
    intruder = register("03005550005", "hirer", "Intruder")
    assert client.get(f"/api/v1/chat/threads/{tid}/messages", headers=intruder["headers"]).status_code == 403


def test_price_offer_counter_accept_and_lock(hirer, verified_worker, client):
    tid = _thread(client, hirer, verified_worker)
    wh, hh = verified_worker["headers"], hirer["headers"]

    # worker proposes a price
    r = client.post(f"/api/v1/chat/threads/{tid}/offer", headers=wh, json={"amount": 2500})
    assert r.status_code == 201 and r.json()["status"] == "pending"
    # you cannot accept your own offer
    assert client.post(f"/api/v1/chat/threads/{tid}/offer/accept", headers=wh).status_code == 403
    # customer counters
    r = client.post(f"/api/v1/chat/threads/{tid}/offer", headers=hh, json={"amount": 2200})
    assert r.json()["proposed_by"] == hirer["id"]
    # worker accepts -> locked at the counter price
    r = client.post(f"/api/v1/chat/threads/{tid}/offer/accept", headers=wh)
    assert r.json()["locked"] is True and r.json()["amount"] == 2200.0
    # once locked, no further changes are allowed
    assert client.post(f"/api/v1/chat/threads/{tid}/offer", headers=hh, json={"amount": 2000}).status_code == 409

    msgs = client.get(f"/api/v1/chat/threads/{tid}/messages", headers=hh).json()
    assert any(m["type"] == "system" and "locked" in m["body"] for m in msgs)
    assert all(m.get("created_at") for m in msgs)  # timestamps present for the chat UI


def test_chat_booking_is_idempotent_no_duplicates(hirer, verified_worker, client):
    client.post("/api/v1/payments/me/wallet/topup", headers=hirer["headers"], json={"amount": 100000, "provider": "easypaisa"})
    tid = _thread(client, hirer, verified_worker)
    client.post(f"/api/v1/chat/threads/{tid}/offer", headers=verified_worker["headers"], json={"amount": 900})
    client.post(f"/api/v1/chat/threads/{tid}/offer/accept", headers=hirer["headers"])  # hirer accepts worker's offer

    r1 = client.post(f"/api/v1/chat/threads/{tid}/booking", headers=hirer["headers"], json={})
    assert r1.status_code == 200 and r1.json()["already"] is False
    bid = r1.json()["booking_id"]
    # tapping proceed-to-pay again must return the SAME booking, not a new one
    for _ in range(3):
        r = client.post(f"/api/v1/chat/threads/{tid}/booking", headers=hirer["headers"], json={})
        assert r.json()["already"] is True and r.json()["booking_id"] == bid
    bookings = client.get("/api/v1/bookings", headers=hirer["headers"]).json()
    assert len(bookings) == 1  # exactly one booking despite 4 taps


def test_new_job_starts_fresh_thread(hirer, verified_worker, client):
    """A new job with the same worker must NOT inherit the previous job's booking/price."""
    client.post("/api/v1/payments/me/wallet/topup", headers=hirer["headers"], json={"amount": 100000, "provider": "easypaisa"})
    wid = verified_worker["id"]

    def _job():
        return client.post("/api/v1/jobs", headers=hirer["headers"], json={
            "category": "plumber", "lat": 31.5, "lng": 74.3, "budget_target": 2000, "budget_max": 2000}).json()["id"]

    # Job A: chat, lock a price, and book it
    jobA = _job()
    tA = client.post("/api/v1/chat/threads", headers=hirer["headers"], json={"peer_id": wid, "job_id": jobA}).json()["id"]
    client.post(f"/api/v1/chat/threads/{tA}/offer", headers=verified_worker["headers"], json={"amount": 900})
    client.post(f"/api/v1/chat/threads/{tA}/offer/accept", headers=hirer["headers"])
    client.post(f"/api/v1/chat/threads/{tA}/booking", headers=hirer["headers"], json={})
    assert client.get(f"/api/v1/chat/threads/{tA}/offer", headers=hirer["headers"]).json()["booking_id"] is not None

    # Job B: a fresh thread with the same worker — no leftover booking/price
    jobB = _job()
    tB = client.post("/api/v1/chat/threads", headers=hirer["headers"], json={"peer_id": wid, "job_id": jobB}).json()["id"]
    assert tB != tA
    offerB = client.get(f"/api/v1/chat/threads/{tB}/offer", headers=hirer["headers"]).json()
    assert offerB["status"] == "none" and offerB["booking_id"] is None
