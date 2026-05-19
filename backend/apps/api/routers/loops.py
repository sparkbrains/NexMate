from fastapi import APIRouter, Depends, HTTPException

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.loop_service import get_loop, list_loops, mark_resolved, reflect_on_loop


router = APIRouter(prefix="/api/loops", tags=["loops"])


@router.get("")
def get_loops(current_user: User = Depends(get_current_user)) -> dict:
    return list_loops(current_user.id)


@router.get("/{loop_id}")
def get_loop_detail(loop_id: str, current_user: User = Depends(get_current_user)) -> dict:
    cleaned = loop_id.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Invalid loop_id")
    loop = get_loop(current_user.id, cleaned)
    if not loop:
        raise HTTPException(status_code=404, detail="Loop not found")
    return {"loop": loop}


@router.post("/{loop_id}/resolve")
def resolve_loop(loop_id: str, current_user: User = Depends(get_current_user)) -> dict:
    cleaned = loop_id.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Invalid loop_id")
    ok = mark_resolved(current_user.id, cleaned)
    if not ok:
        raise HTTPException(status_code=404, detail="Loop not found")
    return {"loop_id": cleaned, "state": "resolved"}


@router.post("/{loop_id}/reflect")
def reflect_loop(loop_id: str, current_user: User = Depends(get_current_user)) -> dict:
    cleaned = loop_id.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Invalid loop_id")
    result = reflect_on_loop(current_user.id, cleaned)
    if not result:
        raise HTTPException(status_code=404, detail="Loop not found")
    print(f"reflect_loop returning: {result}")
    return result