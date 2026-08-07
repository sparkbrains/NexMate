from typing import Any

from fastapi import APIRouter, Depends

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.rewards_service import get_rewards


router = APIRouter(prefix="/api/rewards", tags=["rewards"])


@router.get("")
def get_user_rewards(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return get_rewards(current_user.id)
