from fastapi import APIRouter, Depends

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.dashboard_service import get_dashboard_kpis


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/kpis")
def kpis(current_user: User = Depends(get_current_user)) -> dict:
    return {"kpis": get_dashboard_kpis(current_user.id)}

