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
    database_url: str
    memory_window: int


def get_settings() -> Settings:
    return Settings(
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
        generation_model=os.getenv("GENERATION_MODEL", "openrouter/free"),
        openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        app_referer=os.getenv("APP_REFERER", "http://localhost:8000"),
        app_title=os.getenv("APP_TITLE", "nextmate"),
        database_url=os.getenv("DATABASE_URL", "").strip(),
        memory_window=int(os.getenv("MEMORY_WINDOW", "20")),
    )
