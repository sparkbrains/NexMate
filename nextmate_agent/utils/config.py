import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str | None
    generation_model: str
    openrouter_base_url: str
    app_referer: str
    app_title: str
    summary_store_path: str
    checkpoint_db_path: str
    memory_window: int


def get_settings() -> Settings:
    return Settings(
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
        generation_model=os.getenv("GENERATION_MODEL", "openrouter/free"),
        openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        app_referer=os.getenv("APP_REFERER", "http://localhost:8000"),
        app_title=os.getenv("APP_TITLE", "nextmate"),
        summary_store_path=os.getenv("SUMMARY_STORE_PATH", "data/memory/summaries.jsonl"),
        checkpoint_db_path=os.getenv("CHECKPOINT_DB_PATH", "data/memory/checkpoints.sqlite"),
        memory_window=int(os.getenv("MEMORY_WINDOW", "20")),
    )
