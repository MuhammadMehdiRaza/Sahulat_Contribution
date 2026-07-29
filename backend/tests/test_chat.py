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
