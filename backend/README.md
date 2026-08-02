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

## Voice setup — turn on real speech (simple guide)

The app has a voice assistant (Urdu / English / Roman-Urdu). By default the backend runs in
**demo mode**, where voice always returns the *same fixed sentence* no matter what you say.
Do this once to switch on **real** speech-to-text. It runs fully **offline** on your own
computer — no API key, no cost.

> **On the web (Chrome) you don't need any of this** — the browser does the speech itself.
> This is only for the **phone** app.

**You need Python 3.13** (not 3.14 — the speech engine has no 3.14 build yet).

**Step 1 — make the environment and install the speech engine (once):**
```powershell
cd backend
py -3.13 -m venv .venv                 # low on C: space? use another drive: py -3.13 -m venv D:\sahulat_venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pip install -r requirements-whisper.txt   # the offline speech engine
```

**Step 2 — start the backend with voice ON:**
```powershell
.\run_voice.ps1
```
Done. The **first** voice command takes ~5–10 seconds (it loads the speech model once), then it's
fast. Keep your phone on the **same Wi-Fi**, reload the app, tap the mic, allow the microphone.

**Prefer to run it by hand (no script)?**
```powershell
$env:STT_PROVIDER = "local"
$env:WHISPER_DOWNLOAD_ROOT = "D:/sahulat_models/whisper"
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Good to know**
- The speech model (~140 MB) **downloads automatically** the first time you use `local` mode
  (needs internet just once), then works offline. On a full C: drive, set `WHISPER_DOWNLOAD_ROOT`
  to another drive so it caches there.
- **Don't** put `STT_PROVIDER=local` in a committed `.env` — that makes `pytest` try to use the
  speech engine. Keep it in `run_voice.ps1` / the command above; the tests must stay on demo mode.
- ✅ It's working when the text is *what you actually said* — no longer the fixed
  "mujhe plumber chahiye ghar par, budget 2000 rupay".

**How it works (for reference).** Phone records audio → `POST /api/v1/voice/transcribe`
(faster-whisper) → text → `POST /api/v1/voice/interpret` → the app navigates / searches / posts /
speaks a reply. Both `/voice/*` endpoints accept any logged-in user. Intent parsing is a
deterministic rule-based parser in `app/modules/voice/grammar.py` (English + Roman-Urdu + Urdu
script) — no LLM. `--host 0.0.0.0` lets an Expo Go phone on the same Wi-Fi reach the API.

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
