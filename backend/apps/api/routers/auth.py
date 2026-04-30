from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import (
    User,
    authenticate_user,
    create_session,
    create_user,
    delete_session,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_payload(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at,
    }


@router.post("/signup")
def signup(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    password = str(payload.get("password", ""))
    try:
        user = create_user(email=email, password=password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = create_session(user.id)
    return {"token": token, "user": _user_payload(user)}


@router.post("/login")
def login(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    password = str(payload.get("password", ""))
    user = authenticate_user(email=email, password=password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(user.id)
    return {"token": token, "user": _user_payload(user)}


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user), payload: dict[str, Any] | None = Body(default=None)) -> dict[str, Any]:
    payload = payload or {}
    token = str(payload.get("token", "")).strip()
    if token:
        delete_session(token)
    return {"ok": True, "user_id": current_user.id}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {"user": _user_payload(current_user)}
