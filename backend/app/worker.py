"""Isolated task worker (bidding sessions / notification fan-out).

Kept separate from the API process so a slow AI negotiation round or a push storm
cannot degrade core API uptime. In production this consumes a task queue
(Redis/RQ, Celery, or LangGraph checkpointed sessions); for now it idles so the
container stays healthy and the deployment topology is demonstrable.
"""
import logging
import time

from .core.config import settings

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("worker")


def main() -> None:
    log.info("Sahulat task worker started (env=%s)", settings.app_env)
    while True:  # pragma: no cover - long-running loop
        time.sleep(30)


if __name__ == "__main__":
    main()
