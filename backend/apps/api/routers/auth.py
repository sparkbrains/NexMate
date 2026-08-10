from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from apps.api.deps.auth import get_bearer_token, get_current_user
from apps.api.services.user_profile_service import get_user_profile_text
from apps.api.services.auth_service import (
    WS_TICKET_TTL_SECONDS,
    User,
    authenticate_user,
    change_password,
    complete_onboarding,
    create_session,
    create_user,
    create_ws_ticket,
    delete_session,
    delete_user,
    request_password_reset_otp,
    request_signup_otp,
    resend_password_reset_otp,
    resend_signup_otp,
    reset_password,
    update_profile,
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
        "dob": user.dob,
        "motivation": user.motivation,
        "theme": user.theme,
        "subscription_tier": user.subscription_tier,
        "reminder_enabled": user.reminder_enabled,
        "reminder_time": user.reminder_time,
        "has_journaled_before": user.has_journaled_before,
        "onboarding_completed_at": user.onboarding_completed_at,
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


@router.post("/signup/request-otp")
def signup_request_otp(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    email = str(payload.get("email", "")).strip()
    password = str(payload.get("password", ""))
    try:
        request_signup_otp(email=email, password=password)
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
def logout(current_user: User = Depends(get_current_user), token: str = Depends(get_bearer_token)) -> dict[str, Any]:
    delete_session(token)
    return {"ok": True, "user_id": current_user.id}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {"user": _user_payload(current_user)}


@router.post("/ws-ticket")
def ws_ticket(
    current_user: User = Depends(get_current_user),
    token: str = Depends(get_bearer_token),
) -> dict[str, Any]:
    """Mints a short-lived, single-use ticket for opening a chat WebSocket.
    Browsers can't send an Authorization header on a WS handshake, so the
    long-lived session token never has to appear in the WS URL (and thus
    in access/proxy logs) -- only this one-shot ticket does.
    """
    ticket = create_ws_ticket(token)
    if not ticket:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"ticket": ticket, "expires_in": WS_TICKET_TTL_SECONDS}

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


@router.patch("/profile")
def update_profile_route(
    payload: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    name = str(payload.get("name", current_user.name))
    email = str(payload.get("email", current_user.email))
    dob = payload.get("dob", current_user.dob)
    motivation = payload.get("motivation", current_user.motivation)
    theme = payload.get("theme", current_user.theme)
    # Only validate/change the tier when the caller is actually setting one —
    # a name- or dob-only patch shouldn't require re-sending (and revalidating)
    # whatever tier the account already has, including legacy values like the
    # 'paid' default that predate the Bronze/Silver/Gold tiers.
    subscription_tier = payload.get("subscription_tier")
    try:
        user = update_profile(
            current_user.id,
            name=name,
            email=email,
            dob=dob,
            motivation=motivation,
            theme=theme,
            subscription_tier=subscription_tier,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"user": _user_payload(user)}


@router.patch("/onboarding")
def complete_onboarding_route(
    payload: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    raw = payload.get("has_journaled_before")
    has_journaled_before = raw if isinstance(raw, bool) else None
    try:
        user = complete_onboarding(current_user.id, has_journaled_before)
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