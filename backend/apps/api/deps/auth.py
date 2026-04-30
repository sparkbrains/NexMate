from fastapi import Header, HTTPException

from apps.api.services.auth_service import User, get_user_by_token


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, token = parts
    if scheme.lower() != "bearer":
        return None
    return token.strip()


def get_current_user(authorization: str | None = Header(default=None)) -> User:
    token = _extract_bearer_token(authorization)
    user = get_user_by_token(token or "")
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user

