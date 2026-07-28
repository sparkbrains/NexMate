from typing import Any

from fastapi import APIRouter, Depends

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.user_profile_service import get_or_refresh_user_profile

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("/summary")
async def summary(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    result = await get_or_refresh_user_profile(current_user.id)
    if not result:
        return {"summary": "", "source_answer_count": 0, "generated_date": None}
    return {
        "summary": result["summary_text"],
        "source_answer_count": result["source_answer_count"],
        "generated_date": result["generated_date"].isoformat(),
    }