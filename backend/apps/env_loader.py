import os
from pathlib import Path

from dotenv import load_dotenv


def load_runtime_env() -> str:
    base_dir = Path(__file__).resolve().parents[1]
    default_env = base_dir / ".env"
    load_dotenv(default_env, override=False)

    app_env = os.getenv("APP_ENV", "local").strip().lower() or "local"
    profile_env = base_dir / f".env.{app_env}"
    if profile_env.exists():
        load_dotenv(profile_env, override=True)

    return app_env

