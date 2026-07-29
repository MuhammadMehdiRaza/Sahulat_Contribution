def _submit(client, headers, **over):
    payload = {"cnic": "3520212345671", "full_name": "W", "dob": "1990-01-01",
               "card_issue_date": "2018-01-01", "fingerprint_b64": "fp", "portrait_b64": "img"}
    payload.update(over)
    return client.post("/api/v1/kyc/submit", headers=headers, json=payload)


def test_kyc_verified_sets_badge(worker, client):
    r = _submit(client, worker["headers"])
    assert r.json()["status"] == "verified"
    assert r.json()["badges"]["cnic"] is True


def test_kyc_manual_review_holds_account(worker, client):
    r = _submit(client, worker["headers"], fingerprint_b64=None)  # portrait-only -> 0.55 < 0.75
    assert r.json()["status"] == "manual_review"
    assert client.get("/api/v1/auth/me", headers=worker["headers"]).json()["status"] == "on_hold"


def test_kyc_rejected_on_bad_cnic(worker, client):
    r = _submit(client, worker["headers"], cnic="123")
    assert r.json()["status"] == "rejected"
    assert r.json()["badges"]["cnic"] is False


def test_badges_default_false_before_kyc(worker, client):
    r = client.get("/api/v1/kyc/status", headers=worker["headers"])
    assert r.json()["status"] == "pending"
    assert r.json()["badges"]["cnic"] is False
