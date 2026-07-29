# Deployment Notes — KaamConnect Backend

Deployment assumptions, environment variables, Docker setup, logging, and secrets for
the FastAPI backend. (Companion to Section 5.2 §7.)

## 1. Assumptions
- **Topology:** one FastAPI service (modular monolith) behind a TLS-terminating reverse
  proxy (Nginx/Traefik), plus an **isolated task worker** for bidding/notification
  fan-out so heavy async work can't degrade core API uptime (target 99.9%).
- **Data:** PostgreSQL 16 + PostGIS and Redis 7. A **SQLite fast-path** exists for local
  dev/tests (`DATABASE_URL=sqlite:///./sahulat.db`) — no external services required.
- **Rollout:** Android-first mobile client + PWA fallback; launch cities
  Islamabad/Rawalpindi, Lahore, Karachi with per-city geofence tuning.
- **Providers:** every third party is behind an adapter; **mock** implementations ship by
  default and switch to real providers purely via environment variables.

## 2. Environment variables
See [`.env.example`](.env.example) for the full list with defaults. Key ones:

| Variable | Purpose | Default |
|---|---|---|
| `SECRET_KEY` | JWT signing secret (≥32 bytes) | *(set in prod)* |
| `DATABASE_URL` | SQLAlchemy DB URL | `sqlite:///./sahulat.db` |
| `REDIS_URL` / `USE_REDIS` | Redis geo index + cache | `redis://localhost:6379/0` / `false` |
| `OTP_TTL_SECONDS` | OTP expiry | `180` |
| `*_PROVIDER` (OTP/NADRA/PAYMENT/STT/PUSH) | select mock vs real | `mock` |
| `EXPOSE_DEBUG_OTP` | return OTP in response (dev only) | `true` — **set `false` in prod** |
| `PLATFORM_FEE_PCT` | platform fee | `0.10` |
| `MATCH_*_RADIUS_KM`, `EMERGENCY_RADIUS_KM` | geofence | `10` / `15` / `5` |
| `BID_MAX_ROUNDS`, `BID_CONVERGE_PKR` | bidding engine | `5` / `500` |
| provider secrets (`NADRA_API_KEY`, `EASYPAISA_KEY`, …) | injected; never committed | — |

## 3. Docker
```bash
cp .env.example .env          # then edit secrets
docker compose up --build     # api :8000, db :5432 (postgis), redis :6379, worker
```
- `Dockerfile` — slim Python 3.12 base, non-root `appuser`, `uvicorn app.main:app`.
- `docker-compose.yml` — `api`, `db` (postgis/postgis:16), `redis`, and an isolated
  `worker`. Health checks gate `api`/`worker` start on `db`/`redis` readiness; a named
  volume persists Postgres data.

## 4. Schema & migrations
- Local/tests use `Base.metadata.create_all` (automatic on startup).
- Production should adopt **Alembic** (`alembic upgrade head`) on release for versioned
  migrations. Seed reference data with `python -m app.seed` (service categories + admin).

## 5. Logging
- Structured logs to stdout (captured by the container runtime); level via `LOG_LEVEL`.
- Recommended additions for prod: per-request correlation-id middleware and a separate
  **audit** stream for KYC decisions, bid rounds, escrow movements, and admin actions.

## 6. Secrets
- 12-factor: all secrets via environment (Docker/K8s secrets or a vault).
- No secret in source control; `.env` is git-ignored, `.env.example` holds placeholders.
- Rotate `SECRET_KEY` per environment; scope provider keys least-privilege.
- No provider keys or credential files are committed; all secrets are injected at deploy time.

## 7. Production hardening checklist
- [ ] `APP_ENV=production`, `EXPOSE_DEBUG_OTP=false`, strong `SECRET_KEY`.
- [ ] Real providers wired (`*_PROVIDER != mock`) with secrets injected.
- [ ] Postgres+PostGIS and Redis provisioned; `USE_REDIS=true`.
- [ ] Alembic migrations applied; backups configured.
- [ ] TLS at the proxy; rate-limiting on `/auth/*`; CORS locked to the app origin.
- [ ] Centralised logging/metrics; health checks wired to the orchestrator.
