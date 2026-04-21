from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from apps.api.config import WEB_DIR
from apps.api.services.thread_service import (
    delete_thread_everywhere,
    get_thread_messages,
    list_threads,
)


router = APIRouter()


@router.get("/")
def root() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@router.get("/api/threads")
def get_threads() -> dict[str, list[dict[str, str]]]:
    return {"threads": list_threads()}


@router.get("/api/threads/{thread_id}/messages")
def get_messages(thread_id: str) -> dict[str, Any]:
    cleaned_thread_id = thread_id.strip()
    if not cleaned_thread_id:
        raise HTTPException(status_code=400, detail="Invalid thread_id")
    return {"thread_id": cleaned_thread_id, "messages": get_thread_messages(cleaned_thread_id)}


@router.delete("/api/threads/{thread_id}")
def delete_thread(thread_id: str) -> dict[str, Any]:
    cleaned_thread_id = thread_id.strip()
    if not cleaned_thread_id:
        raise HTTPException(status_code=400, detail="Invalid thread_id")
    return delete_thread_everywhere(cleaned_thread_id)

