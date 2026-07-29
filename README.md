# Sahulat / KaamConnect

An inclusive marketplace that connects Pakistani households with **verified** home-service workers
(plumbers, electricians, carpenters, cleaners, cooks, household staff) — with identity verification,
geofenced matching, AI-assisted fair price negotiation, escrow / Cash-on-Delivery payments, in-app
chat, and full **English / Urdu / Roman-Urdu** support.

- **`backend/`** — FastAPI service (Python): 11 modules, REST + WebSocket, SQLAlchemy, JWT auth, tests.
- **`frontend/`** — React Native / **Expo** app (17 screens). Runs on **Android & iOS phones** (via
  Expo Go) and in a **web browser**.

---

## 1. Install once

Prerequisites: **Python 3.12+** (python.org, tick "Add to PATH") and **Node.js 20+** (nodejs.org).

> Windows uses `.venv\Scripts\python`. macOS/Linux use `.venv/bin/python`.

**Backend**
```
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m app.demo_seed          # sample data (5 verified workers + a demo customer)
```

**Frontend**
```
cd frontend
npm install
```

---

## 2. Run it on your PHONE (Expo Go) 📱

This is the main way to use the app on a real phone.

1. **Phone and computer must be on the same Wi‑Fi.**
2. Install **Expo Go** from the **Play Store / App Store** on your phone.
3. **Start the backend** so the phone can reach it — note `--host 0.0.0.0`:
   ```
   cd backend
   .venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   (Click **Allow** if Windows Firewall asks — allow on **Private** networks.)
4. **Start the app** (new terminal):
   ```
   cd frontend
   npm start
   ```
   A **QR code** appears.
5. Open **Expo Go** on your phone → **Scan QR code**.

The app opens on your phone. It **auto-detects your computer's IP**, so login, workers, bidding, etc.
work with no editing. (The UI even shows without the backend; the backend is only needed for real data.)

> If Expo Go says "incompatible version", update Expo Go from the store — this project targets the
> store SDK. If you change code and it doesn't refresh, restart with `npm start -c` (clears the cache).

---

## 3. Run it in a browser (optional)

```
# terminal 1
cd backend
.venv\Scripts\python -m uvicorn app.main:app --port 8000
# terminal 2
cd frontend
npm run web        # then open http://localhost:8081
```

---

## 4. Logging in

**Demo accounts** (password **`demo1234`**):

| Role | Username | Phone |
|---|---|---|
| Customer | `customer` | `03007000001` |
| Worker | `ahmed` | `03211000001` |

Or **Sign up**: pick a language → Sign up → role, name, username, password, phone. Login uses
**username + password + phone**, then a one-time **OTP** (auto-filled in demo mode — no real SMS).

*(On the browser build you can also use the quick links `?demo=hirer`, `?demo=worker`, `&lang=ur`.)*

---

## 5. Backend tests
```
cd backend
.venv\Scripts\python -m pytest
```

---

## Tech stack
React Native + Expo · FastAPI (Python) · SQLAlchemy (SQLite dev / PostgreSQL-ready) · JWT + OTP ·
Docker + docker-compose.

## Project structure
```
backend/   app/ (core, models, adapters, 11 modules), tests/, requirements.txt, Dockerfile
frontend/  App.tsx, src/ (theme, api, state, ui, screens/), package.json
```
