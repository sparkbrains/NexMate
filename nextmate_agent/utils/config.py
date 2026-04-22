import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    llm_api_key: str | None
    generation_model: str
    app_referer: str
    app_title: str
    summary_store_path: str
    checkpoint_db_path: str
    memory_window: int
    loop_store_path: str


def get_settings() -> Settings:
    api_key = os.getenv("LLM_API_KEY") or os.getenv("GROQ_API_KEY")

    return Settings(
        llm_api_key=api_key,
        generation_model=os.getenv("GENERATION_MODEL"),
        app_referer=os.getenv("APP_REFERER", "http://localhost:8000"),
        app_title=os.getenv("APP_TITLE", "nexmate"),
        summary_store_path=os.getenv("SUMMARY_STORE_PATH", "data/memory/summaries.jsonl"),
        checkpoint_db_path=os.getenv("CHECKPOINT_DB_PATH", "data/memory/checkpoints.sqlite"),
        memory_window=int(os.getenv("MEMORY_WINDOW", "20")),
        loop_store_path=os.getenv("LOOP_STORE_PATH", "data/memory/loops.jsonl"),
    )
