import asyncio

from fastapi import Depends, Header, HTTPException

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


async def get_bearer_token(authorization: str | None = Header(default=None)) -> str:
    """Extracts and validates the bearer token is present in the request.
    Shared by get_current_user and any endpoint (like logout) that needs
    the exact token that authenticated the request, rather than one
    supplied separately in a request body.
    """
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return token


async def get_current_user(token: str = Depends(get_bearer_token)) -> User:
    # get_user_by_token does a synchronous DB round trip; run it off the
    # event loop so one slow lookup can't stall every other request.
    user = await asyncio.to_thread(get_user_by_token, token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user
