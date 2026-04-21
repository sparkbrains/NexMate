import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
WEB_DIR = BASE_DIR / "web"
THREAD_LOG_PATH = Path(
    os.getenv("THREAD_MESSAGE_LOG_PATH", str(BASE_DIR / "data" / "memory" / "thread_messages.jsonl"))
)
STREAM_CHUNK_SIZE = int(os.getenv("STREAM_CHUNK_SIZE", "1"))
STREAM_DELAY_SECONDS = float(os.getenv("STREAM_DELAY_SECONDS", "0.03"))
