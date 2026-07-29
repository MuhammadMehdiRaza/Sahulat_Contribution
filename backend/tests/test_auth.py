def test_otp_request_and_new_user_login(client):
    code = client.post("/api/v1/auth/otp/request", json={"phone": "03001234567"}).json()["debug_code"]
    r = client.post("/api/v1/auth/verify", json={
        "phone": "03001234567", "code": code, "role": "hirer", "full_name": "Ali"})
    assert r.status_code == 200
    body = r.json()
    assert body["created"] is True
    assert body["user"]["role"] == "hirer"
    assert body["access_token"]


def test_wrong_otp_rejected(client):
    code = client.post("/api/v1/auth/otp/request", json={"phone": "03007654321"}).json()["debug_code"]
    wrong = "9999" if code != "9999" else "0000"
    r = client.post("/api/v1/auth/verify", json={
        "phone": "03007654321", "code": wrong, "role": "hirer", "full_name": "Ali"})
    assert r.status_code == 400


def test_verify_without_request_fails(client):
    r = client.post("/api/v1/auth/verify", json={
        "phone": "03000000000", "code": "1234", "role": "hirer", "full_name": "Ali"})
    assert r.status_code == 400


def test_new_user_requires_role(client):
    code = client.post("/api/v1/auth/otp/request", json={"phone": "03009998887"}).json()["debug_code"]
    r = client.post("/api/v1/auth/verify", json={"phone": "03009998887", "code": code})
    assert r.status_code == 422


def test_me_and_language_update(hirer, client):
    assert client.get("/api/v1/auth/me", headers=hirer["headers"]).status_code == 200
    r = client.patch("/api/v1/auth/me/language", headers=hirer["headers"], json={"language": "ur"})
    assert r.json()["language"] == "ur"


def test_role_is_immutable_on_relogin(client):
    _ = client.post("/api/v1/auth/otp/request", json={"phone": "03005556667"}).json()["debug_code"]
    code = _
    client.post("/api/v1/auth/verify", json={
        "phone": "03005556667", "code": code, "role": "worker", "full_name": "W"})
    code2 = client.post("/api/v1/auth/otp/request", json={"phone": "03005556667"}).json()["debug_code"]
    r = client.post("/api/v1/auth/verify", json={
        "phone": "03005556667", "code": code2, "role": "hirer", "full_name": "W"})
    assert r.json()["user"]["role"] == "worker"  # role unchanged


def test_unauthenticated_rejected(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_signup_login_otp_flow(client):
    r = client.post("/api/v1/auth/signup", json={
        "username": "testuser", "password": "pass1234", "full_name": "Test", "phone": "03008887766", "role": "hirer"})
    assert r.status_code == 200 and r.json()["ok"] is True
    r2 = client.post("/api/v1/auth/login", json={"username": "testuser", "password": "pass1234", "phone": "03008887766"})
    assert r2.status_code == 200
    code = r2.json()["debug_code"]
    r3 = client.post("/api/v1/auth/login/verify", json={"phone": "03008887766", "code": code})
    assert r3.status_code == 200 and r3.json()["access_token"]
    assert r3.json()["user"]["username"] == "testuser"


def test_login_wrong_password(client):
    client.post("/api/v1/auth/signup", json={
        "username": "u2", "password": "right123", "full_name": "T", "phone": "03001110009", "role": "worker"})
    r = client.post("/api/v1/auth/login", json={"username": "u2", "password": "wrong123", "phone": "03001110009"})
    assert r.status_code == 401


def test_login_phone_mismatch(client):
    client.post("/api/v1/auth/signup", json={
        "username": "u3", "password": "right123", "full_name": "T", "phone": "03001110010", "role": "worker"})
    r = client.post("/api/v1/auth/login", json={"username": "u3", "password": "right123", "phone": "03009999999"})
    assert r.status_code == 401


def test_signup_duplicate_username(client):
    client.post("/api/v1/auth/signup", json={
        "username": "dup", "password": "x1234", "full_name": "T", "phone": "03001110001", "role": "hirer"})
    r = client.post("/api/v1/auth/signup", json={
        "username": "dup", "password": "x1234", "full_name": "T", "phone": "03001110002", "role": "hirer"})
    assert r.status_code == 409
