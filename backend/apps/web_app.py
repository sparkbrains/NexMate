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
from apps.api.services.auth_service import init_auth_db, seed_dummy_users_from_env
from apps.api.routers.support import router as support_router
app = FastAPI(title="NexMate Web")
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
    import asyncio
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("apps.web_app:app", host="127.0.0.1", port=8000, reload=True)
