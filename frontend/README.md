# KaamConnect — Mobile App (Expo / React Native)

The Sahulat / KaamConnect client, wired to the FastAPI backend. Runs on Android, iOS, and
**web** (used for browser demos). Built with Expo SDK 54 + React Native 0.81.

## Run (web / browser demo)
1. **Start the backend first** (see `../backend/README.md`), then seed demo data:
   ```bash
   cd ../backend
   .venv/Scripts/python -m app.demo_seed          # categories + 5 verified workers
   .venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
2. **Start the app (web):**
   ```bash
   cd frontend
   npm install          # first time only
   npm run web          # opens http://localhost:8081
   ```

## Run on a phone
```bash
npm run start          # scan the QR with Expo Go
```
On a physical device, set the API base to your machine's LAN IP (the app defaults to
`http://localhost:8000/api/v1`, which only works for the web/emulator on the same machine).
Edit `src/api.ts` `API_BASE`, or in the browser console set `window.__API_BASE__`.

## One-click demo logins (OTP is mocked)
- `http://localhost:8081/?demo=hirer` — logs in as a customer and opens Home.
- `http://localhost:8081/?demo=worker` — logs in as a verified worker's dashboard.
- `http://localhost:8081/?demo=hirer&screen=bidding` — auto-runs an AI negotiation.

## Structure
```
App.tsx            root + state-machine router
src/
  theme.ts         Kaam.pk green design tokens
  api.ts           fetch client for every backend endpoint
  state.tsx        auth + navigation context (+ demo deep-link)
  ui.tsx           shared components (Btn, Card, Badge, Header, Field, Screen…)
  BottomNav.tsx    role-aware bottom navigation
  dates.ts         date/time + deadline helpers
  screens/         20+ screens (onboarding, home, post job, applicants, chat,
                   booking status, wallet, worker profile, …)
```

## Not yet added (planned)
- **Interactive map location picker** — you can pick your **current GPS** or a **city from across
  Pakistan**; a full drag-a-pin map needs `react-native-maps` + a Google Maps/Mapbox key.
- **Real device push notifications** — alerts are **in-app only** (no FCM/APNs yet).
- **Real voice notes / voice-to-text** — voice input is mocked (returns a canned transcript).
- **Real wallet top-up** — Easypaisa/JazzCash top-up is a **sandbox/instant-credit** demo; real
  money-in needs a merchant account + a payment webhook on the backend.
- **Installable builds** — runs today via **Expo Go** and **web**; Android **APK** / iOS builds are
  produced with **EAS** (iOS also needs an Apple Developer account). Verified on **Android + web**;
  not yet run on a physical **iPhone** (the code is fully cross-platform).
