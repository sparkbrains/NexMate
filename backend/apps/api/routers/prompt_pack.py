from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.prompt_pack_service import (
    get_todays_prompt,
    list_all_prompts,
    list_prompt_answers,
    save_prompt_answer,
)

router = APIRouter(prefix="/api/dashboard/prompt-pack", tags=["prompt-pack"])


@router.get("/today")
def today(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return get_todays_prompt(current_user.id)


@router.get("/all")
def all_prompts(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return list_all_prompts(current_user.id)


@router.post("/{prompt_id}/answer")
async def answer(
    prompt_id: str,
    payload: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    answer_text = str(payload.get("answer_text", ""))
    try:
        result = await save_prompt_answer(current_user.id, prompt_id, answer_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"answer": result}


@router.get("/history")
def history(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {"answers": list_prompt_answers(current_user.id)}