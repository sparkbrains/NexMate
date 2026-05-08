from fastapi import APIRouter, Depends, Query

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.dashboard_service import (
    get_dashboard_insights,
    get_dashboard_kpis,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/kpis")
def kpis(current_user: User = Depends(get_current_user)) -> dict:
    return {"kpis": get_dashboard_kpis(current_user.id)}


@router.get("/insights")
def insights(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
) -> dict:
    return {"insights": get_dashboard_insights(current_user.id, days=days)}