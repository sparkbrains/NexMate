from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from apps.api.deps.auth import get_current_user
from apps.api.services.user_profile_service import get_user_profile_text
from apps.api.services.auth_service import (
    User,
    authenticate_user,
    change_password,
    create_session,
    create_user,
    delete_session,
    delete_user,
    request_password_reset_otp,
    request_signup_otp,
    resend_password_reset_otp,
    resend_signup_otp,
    reset_password,
    update_reminder_settings,
    verify_password_reset_otp,
    verify_signup_otp,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_payload(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "created_at": user.created_at,
        "name": user.name,
        "age": user.age,
        "subscription_tier": user.subscription_tier,
        "reminder_enabled": user.reminder_enabled,
        "reminder_time": user.reminder_time,
    }


@router.post("/signup")
def signup(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    password = str(payload.get("password", ""))
    name = str(payload.get("name", "")).strip()
    try:
        age = int(payload.get("age"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Age is required")
    try:
        user = create_user(email=email, password=password, name=name, age=age)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = create_session(user.id)
    return {"token": token, "user": _user_payload(user)}


@router.post("/signup/request-otp")
def signup_request_otp(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    password = str(payload.get("password", ""))
    name = str(payload.get("name", "")).strip()
    try:
        age = int(payload.get("age"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Age is required")
    try:
        request_signup_otp(email=email, password=password, name=name, age=age)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "Code sent"}


@router.post("/signup/resend-otp")
def signup_resend_otp(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    try:
        resend_signup_otp(email=email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "Code resent"}


@router.post("/signup/verify-otp")
def signup_verify_otp(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    otp = str(payload.get("otp", "")).strip()
    try:
        user = verify_signup_otp(email=email, otp=otp)
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

@router.patch("/reminder")
def update_reminder(
    payload: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    enabled = bool(payload.get("enabled", False))
    reminder_time = str(payload.get("reminder_time", "20:00"))
    try:
        user = update_reminder_settings(current_user.id, enabled, reminder_time)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"user": _user_payload(user)}


@router.get("/profile/summary")
async def get_profile_summary(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """Return the internal user profile summary for the authenticated user.
    The summary is generated once per day and cached in the DB.
    """
    summary = await get_user_profile_text(current_user.id)
    return {"summary": summary}


# --- forgot password ------------------------------------------------

@router.post("/password-reset/request-otp")
def password_reset_request_otp(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    try:
        request_password_reset_otp(email=email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Always the same response, whether or not the email is registered —
    # the service layer already declines to reveal that.
    return {"message": "If that email is registered, a code has been sent"}


@router.post("/password-reset/resend-otp")
def password_reset_resend_otp(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    try:
        resend_password_reset_otp(email=email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "Code resent"}


@router.post("/password-reset/verify-otp")
def password_reset_verify_otp(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    otp = str(payload.get("otp", "")).strip()
    try:
        verify_password_reset_otp(email=email, otp=otp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "Code verified"}


@router.post("/password-reset/reset")
def password_reset_reset(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    otp = str(payload.get("otp", "")).strip()
    new_password = str(payload.get("new_password", ""))
    try:
        reset_password(email=email, otp=otp, new_password=new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "Password updated"}


# --- logged-in profile actions ------------------------------------------

@router.post("/change-password")
def change_password_route(
    payload: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    current_password = str(payload.get("current_password", ""))
    new_password = str(payload.get("new_password", ""))
    try:
        change_password(user_id=current_user.id, current_password=current_password, new_password=new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "Password updated"}


@router.delete("/account")
def delete_account(
    payload: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    password = str(payload.get("password", ""))
    try:
        delete_user(user_id=current_user.id, password=password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "Account deleted"}