"""FastAPI application factory for the KaamConnect backend."""
import logging

from fastapi import FastAPI

from . import models  # noqa: F401  (register models on Base.metadata)
from .core.config import settings
from .core.database import Base, engine

logging.basicConfig(level=settings.log_level)


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)
    app = FastAPI(title="Sahulat / KaamConnect API", version="0.1.0")

    # CORS: allow the mobile/web client to call the API (bearer tokens, no cookies).
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_credentials=False,
        allow_methods=["*"], allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    def health():
        return {"status": "ok", "env": settings.app_env}

    # Domain routers
    from .modules.auth.router import router as auth_router
    from .modules.profile.router import router as profile_router
    from .modules.kyc.router import router as kyc_router
    from .modules.jobs.router import router as jobs_router
    from .modules.matching.router import router as matching_router
    from .modules.bidding.router import router as bidding_router
    from .modules.booking.router import router as booking_router
    from .modules.payment.router import router as payment_router
    from .modules.chat.router import router as chat_router
    from .modules.notifications.router import router as notifications_router
    from .modules.admin.router import router as admin_router

    for r in (
        auth_router, profile_router, kyc_router, jobs_router, matching_router,
        bidding_router, booking_router, payment_router, chat_router,
        notifications_router, admin_router,
    ):
        app.include_router(r, prefix="/api/v1")

    return app


app = create_app()
