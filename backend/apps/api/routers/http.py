from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.thread_service import (
    delete_thread_everywhere,
    get_thread_messages,
    list_threads,
)


router = APIRouter()


@router.get("/")
def root() -> dict[str, str]:
    return {"name": "NextMate API", "status": "ok"}


@router.get("/api/threads")
def get_threads(current_user: User = Depends(get_current_user)) -> dict[str, list[dict[str, str]]]:
    return {"threads": list_threads(current_user.id)}


@router.get("/api/threads/{thread_id}/messages")
def get_messages(thread_id: str, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    cleaned_thread_id = thread_id.strip()
    if not cleaned_thread_id:
        raise HTTPException(status_code=400, detail="Invalid thread_id")
    return {
        "thread_id": cleaned_thread_id,
        "messages": get_thread_messages(current_user.id, cleaned_thread_id),
    }


@router.delete("/api/threads/{thread_id}")
def delete_thread(thread_id: str, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    cleaned_thread_id = thread_id.strip()
    if not cleaned_thread_id:
        raise HTTPException(status_code=400, detail="Invalid thread_id")
    return delete_thread_everywhere(current_user.id, cleaned_thread_id)
