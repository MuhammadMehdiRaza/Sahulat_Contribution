# KaamConnect — Backend (FastAPI)

Backend for **Sahulat / KaamConnect**, an agentic domestic-services marketplace for
Pakistan. Implements Section 5.2 (*Architecture, Backend & Database*) as a runnable,
tested service. Design doc: [`../docs/Section_5.2_Architecture_Backend_Database.pdf`](../docs/Section_5.2_Architecture_Backend_Database.pdf).

## Stack
FastAPI · SQLAlchemy 2.0 · Pydantic v2 · JWT (PyJWT) · PostgreSQL/PostGIS + Redis
(production) with a **SQLite fast-path** for local/tests. External providers
(NADRA, EasyPaisa/JazzCash, SMS/WhatsApp, Whisper STT, FCM/APNs) are **mock adapters**
with clean seams for real credentials.

## Modules (11)
`auth` · `profile` · `kyc` · `jobs` · `matching` · `bidding` · `booking` · `payment`
· `chat` · `notifications` · `admin`. The AI price negotiation is a deterministic
Boulware-vs-Conceder concession engine (`app/modules/bidding/engine.py`) — no LLM needed.

## Quickstart (local, SQLite)
```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux
python -m app.seed                     # optional: seed categories + admin
uvicorn app.main:app --reload          # http://127.0.0.1:8000/docs
```
Interactive API docs (OpenAPI/Swagger) at **`/docs`**, health at **`/health`**.

## Run the tests
```bash
cd backend
.venv/Scripts/python -m pytest         # all modules, no external services
```

## Run with Docker (Postgres + PostGIS + Redis)
```bash
cd backend
cp .env.example .env
docker compose up --build              # api :8000, db :5432, redis :6379, worker
```

## Auth flow (mock OTP)
```bash
# 1) request OTP (dev returns debug_code)
curl -s -XPOST localhost:8000/api/v1/auth/otp/request -H 'content-type: application/json' \
  -d '{"phone":"03001234567","channel":"sms"}'
# 2) verify -> access_token (new users pass role + full_name)
curl -s -XPOST localhost:8000/api/v1/auth/verify -H 'content-type: application/json' \
  -d '{"phone":"03001234567","code":"<debug_code>","role":"hirer","full_name":"Ali"}'
```

## Layout
```
backend/
  app/
    core/        config, database, security (JWT/OTP/PIN), RBAC deps, utils
    adapters/    mock external providers (NADRA, payments, SMS, STT, push, maps)
    models.py    all ORM entities
    modules/     one package per domain module (router + service where needed)
    main.py      app factory + router wiring
    worker.py    isolated background task worker
    seed.py      reference-data seeder
  tests/         pytest suite (one file per module) + conftest fixtures
  Dockerfile · docker-compose.yml · .env.example · DEPLOYMENT.md
```

## Notes
- Money is `NUMERIC(12,2)`; UUID string PKs for SQLite/Postgres portability.
- Geofencing uses haversine over the latest worker location; Redis GEO is the drop-in
  production path (see plan §2.5) and is not required for correctness.
- Verified badges (CNIC/Police/Skill) are **only** set server-side from a provider
  response, never by the client (FR-KYC-03).
