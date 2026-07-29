"""Shared pytest fixtures. Uses an isolated file-based SQLite DB reset per test."""
import os
import pathlib
import tempfile

_TEST_DB = pathlib.Path(tempfile.gettempdir()) / "sahulat_test.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB.as_posix()}")
os.environ.setdefault("APP_ENV", "test")

import pytest  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


def _register(client, phone, role, name="User", lang="en"):
    code = client.post("/api/v1/auth/otp/request", json={"phone": phone, "channel": "sms"}).json()["debug_code"]
    r = client.post("/api/v1/auth/verify", json={
        "phone": phone, "code": code, "role": role, "full_name": name, "language": lang})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["access_token"], "id": data["user"]["id"],
            "headers": {"Authorization": f"Bearer {data['access_token']}"}}


@pytest.fixture
def register(client):
    def _factory(phone, role, name="User", lang="en"):
        return _register(client, phone, role, name, lang)
    return _factory


@pytest.fixture
def hirer(client):
    return _register(client, "03001110001", "hirer", "Test Hirer")


@pytest.fixture
def worker(client):
    return _register(client, "03002220002", "worker", "Test Worker")


@pytest.fixture
def admin():
    db = SessionLocal()
    u = User(phone="03009990009", role="admin", full_name="Admin", status="active")
    db.add(u)
    db.commit()
    db.refresh(u)
    uid = u.id
    db.close()
    token = create_access_token(uid, "admin")
    return {"token": token, "id": uid, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture
def verified_worker(client):
    """A KYC-verified, available worker with skills, rates and a live location."""
    w = _register(client, "03003330003", "worker", "Verified Worker")
    h = w["headers"]
    # KYC: valid 13-digit CNIC + both biometrics -> verified, badge set server-side
    kyc = client.post("/api/v1/kyc/submit", headers=h, json={
        "cnic": "3520212345671", "full_name": "Verified Worker", "dob": "1990-01-01",
        "card_issue_date": "2018-01-01", "fingerprint_b64": "fp", "portrait_b64": "img"})
    assert kyc.json()["status"] == "verified", kyc.text
    client.put("/api/v1/profiles/me/worker", headers=h, json={
        "skills": ["plumber"], "bio": "10 yrs", "base_lat": 31.5204, "base_lng": 74.3587,
        "service_radius_km": 10, "rate_min": 1500, "rate_target": 2500})
    client.patch("/api/v1/profiles/me/worker/availability", headers=h, json={"availability": "available"})
    client.post("/api/v1/matching/locations", headers=h, json={"lat": 31.5204, "lng": 74.3587})
    w["lat"], w["lng"] = 31.5204, 74.3587
    return w
