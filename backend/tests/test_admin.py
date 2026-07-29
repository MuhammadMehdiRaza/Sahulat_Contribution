def test_admin_lists_users(admin, hirer, client):
    r = client.get("/api/v1/admin/users", headers=admin["headers"])
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_admin_role_required(hirer, client):
    assert client.get("/api/v1/admin/users", headers=hirer["headers"]).status_code == 403


def test_admin_reviews_kyc(admin, worker, client):
    client.post("/api/v1/kyc/submit", headers=worker["headers"], json={
        "cnic": "3520212345671", "full_name": "W", "dob": "1990-01-01",
        "card_issue_date": "2018-01-01", "portrait_b64": "img"})  # -> manual_review
    pending = client.get("/api/v1/admin/kyc/pending", headers=admin["headers"]).json()
    assert any(k["user_id"] == worker["id"] for k in pending)
    r = client.post(f"/api/v1/admin/kyc/{worker['id']}/review", headers=admin["headers"],
                    json={"decision": "verified", "badges": ["cnic", "skill"]})
    assert r.json()["status"] == "verified"


def test_admin_suspends_user(admin, worker, client):
    r = client.patch(f"/api/v1/admin/users/{worker['id']}/status", headers=admin["headers"],
                     json={"status": "suspended"})
    assert r.json()["status"] == "suspended"
    assert client.get("/api/v1/auth/me", headers=worker["headers"]).status_code == 403  # suspended blocked


def test_admin_metrics(admin, client):
    r = client.get("/api/v1/admin/metrics", headers=admin["headers"])
    assert r.status_code == 200
    assert "gmv" in r.json() and "platform_revenue" in r.json()
