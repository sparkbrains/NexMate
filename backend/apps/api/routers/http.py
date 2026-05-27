from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.thread_service import (
    delete_thread_everywhere,
    get_thread_messages,
    list_threads,
)
from apps.api.services.transcription_service import transcribe_audio


router = APIRouter()


@router.get("/")
def root() -> dict[str, str]:
    return {"name": "NextMate API", "status": "ok"}


@router.get("/api/threads")
def get_threads(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
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


@router.post("/api/transcribe")
async def transcribe_endpoint(request: Request, current_user: User = Depends(get_current_user)) -> dict[str, Any]:

    try:
        body = await request.body()
        if not body or len(body) == 0:
            raise HTTPException(status_code=400, detail="No audio data provided")
        
        result = await transcribe_audio(body)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("error", "Transcription failed"))
        
        return {
            "success": True,
            "transcript": result["transcript"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")
