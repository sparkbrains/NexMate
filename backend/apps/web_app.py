import asyncio
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.env_loader import load_runtime_env
from apps.logging_config import configure_logging, get_logger
APP_ENV = load_runtime_env()
configure_logging()
logger = get_logger(__name__)

from apps.api.routers.auth import router as auth_router
from apps.api.routers.dashboard import router as dashboard_router
from apps.api.routers.http import router as http_router
from apps.api.routers.journal import router as journal_router
from apps.api.routers.loops import router as loops_router
from apps.api.routers.prompt_pack import router as prompt_pack_router
from apps.api.routers.ws import router as ws_router
from apps.api.routers.profile import router as profile_router
from apps.api.routers.rewards import router as rewards_router
from apps.api.services.auth_service import (
    cleanup_expired_records,
    init_auth_db,
    purge_expired_soft_deleted_users,
    seed_dummy_users_from_env,
)
from apps.api.routers.support import router as support_router
app = FastAPI(title="NextMate Web")

EXPIRED_RECORDS_CLEANUP_INTERVAL_SECONDS = int(
    os.getenv("EXPIRED_RECORDS_CLEANUP_INTERVAL_SECONDS", str(60 * 60))
)
SOFT_DELETE_PURGE_INTERVAL_SECONDS = int(
    os.getenv("SOFT_DELETE_PURGE_INTERVAL_SECONDS", str(60 * 60 * 24))
)

# Held for the lifetime of the app so asyncio doesn't garbage-collect the
# loop task mid-run (create_task only keeps a weak reference internally).
_startup_tasks: set[asyncio.Task] = set()


async def _cleanup_expired_records_loop() -> None:
    while True:
        try:
            deleted = await asyncio.to_thread(cleanup_expired_records)
            if any(deleted.values()):
                logger.info("Cleaned up expired auth records: %s", deleted)
        except Exception:
            logger.exception("Expired auth records cleanup pass failed")
        await asyncio.sleep(EXPIRED_RECORDS_CLEANUP_INTERVAL_SECONDS)


async def _purge_soft_deleted_users_loop() -> None:
    while True:
        try:
            purged = await asyncio.to_thread(purge_expired_soft_deleted_users)
            if purged:
                logger.info("Purged %d soft-deleted account(s) past their restore window", purged)
        except Exception:
            logger.exception("Soft-deleted account purge pass failed")
        await asyncio.sleep(SOFT_DELETE_PURGE_INTERVAL_SECONDS)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(http_router)
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(prompt_pack_router)
app.include_router(loops_router)
app.include_router(journal_router)
app.include_router(ws_router)
app.include_router(profile_router)
app.include_router(rewards_router)
app.include_router(support_router)
@app.on_event("startup")
async def startup() -> None:
    init_auth_db()
    seed_result = seed_dummy_users_from_env()
    logger.info(
        "Application startup complete .env=%s allowed_origins=%s seeded_dummy_users=%s skipped_dummy_users=%s",
        APP_ENV,
        [origin.strip() for origin in allowed_origins if origin.strip()],
        seed_result["seeded"],
        seed_result["skipped"],
    )
    # Pre-warm user profile summaries for all users with answers
    from apps.api.services.user_profile_service import get_or_refresh_user_profile
    from apps.db import get_connection
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT user_id FROM prompt_pack_answers
            """)
            rows = cur.fetchall()
            user_ids = [r["user_id"] for r in rows]
    for uid in user_ids:
        asyncio.create_task(get_or_refresh_user_profile(uid))

    cleanup_task = asyncio.create_task(_cleanup_expired_records_loop())
    _startup_tasks.add(cleanup_task)
    cleanup_task.add_done_callback(_startup_tasks.discard)

    purge_task = asyncio.create_task(_purge_soft_deleted_users_loop())
    _startup_tasks.add(purge_task)
    purge_task.add_done_callback(_startup_tasks.discard)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("apps.web_app:app", host="127.0.0.1", port=8000, reload=True)
