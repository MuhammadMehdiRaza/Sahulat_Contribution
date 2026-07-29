# KaamConnect — Mobile App (Expo / React Native)

The Sahulat / KaamConnect client, wired to the FastAPI backend. Runs on Android, iOS, and
**web** (used for browser demos). Built with Expo SDK 57 + React Native 0.86.

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
  screens/         15 screens (onboarding … admin-facing bookings)
```
