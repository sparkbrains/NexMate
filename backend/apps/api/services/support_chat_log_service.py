from typing import Any

from apps.db import get_connection, utc_now


def log_support_exchange(
    session_id: str,
    query: str,
    answer: str,
    *,
    user_id: int | None = None,
) -> None:
    """Persist one query/answer pair from the support widget.

    Synchronous (psycopg) by design, matching every other service in this
    codebase -- callers on the async side (the websocket route) are
    responsible for running this off the event loop, e.g. via
    starlette.concurrency.run_in_threadpool.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO support_chat_logs (session_id, user_id, query, answer, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (session_id, user_id, query, answer, utc_now()),
            )
        conn.commit()


def resolve_user_id_from_token(token: str | None) -> int | None:
    """Best-effort lookup against the sessions table (see db.py) so a
    logged-in visitor's support-widget queries get attributed to their
    account. Returns None for a missing, unknown, or expired token --
    the support widget stays fully usable either way, this just decides
    whether user_id gets filled in on the log row.

    Deliberately re-implemented here against the sessions table directly
    rather than reusing deps/auth.get_current_user, since that dependency
    is built for HTTP request auth (raises HTTPException on failure) and
    isn't a fit for an optional, best-effort websocket lookup.
    """
    if not token:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id FROM sessions
                WHERE token = %s AND expires_at > %s
                """,
                (token, utc_now()),
            )
            row = cur.fetchone()
    return int(row["user_id"]) if row else None


def _log_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "session_id": row.get("session_id"),
        "user_id": int(row["user_id"]) if row.get("user_id") is not None else None,
        "query": row.get("query") or "",
        "answer": row.get("answer") or "",
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def list_support_logs(limit: int = 200) -> list[dict[str, Any]]:
    """Not wired to a route yet -- included so an admin/support-review
    endpoint can be added later without another round of DB plumbing.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, session_id, user_id, query, answer, created_at
                FROM support_chat_logs
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
    return [_log_to_dict(r) for r in rows]