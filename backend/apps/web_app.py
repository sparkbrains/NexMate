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
from apps.api.routers.ws import router as ws_router
from apps.api.services.auth_service import init_auth_db, seed_dummy_users_from_env

app = FastAPI(title="NextMate Web")
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
allowed_origin_regex = os.getenv(
    "ALLOWED_ORIGIN_REGEX",
    r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(http_router)
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(ws_router)


@app.on_event("startup")
def startup() -> None:
    init_auth_db()
    seed_result = seed_dummy_users_from_env()
    logger.info(
        "Application startup complete env=%s allowed_origins=%s seeded_dummy_users=%s skipped_dummy_users=%s",
        APP_ENV,
        [origin.strip() for origin in allowed_origins if origin.strip()],
        seed_result["seeded"],
        seed_result["skipped"],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("apps.web_app:app", host="127.0.0.1", port=8000, reload=True)
