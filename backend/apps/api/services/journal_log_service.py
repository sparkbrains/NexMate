from datetime import date as date_type
from typing import Any

from apps.db import get_connection, utc_now


# ---------- helpers ----------

def _entry_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "book_id": int(row["book_id"]) if row.get("book_id") is not None else None,
        "entry_date": row["entry_date"].isoformat() if row.get("entry_date") else None,
        "mood_emoji": row.get("mood_emoji") or "",
        "mood_label": row.get("mood_label") or "",
        "body": row.get("body") or "",
        "translated": row.get("translated") or "",
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


def _book_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": row.get("name") or "",
        "color": row.get("color") or "",
        "entry_count": int(row["entry_count"]) if row.get("entry_count") is not None else 0,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ---------- books ----------

def list_books(user_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT b.id, b.name, b.color, b.created_at,
                       COUNT(l.id) AS entry_count
                FROM journal_books b
                LEFT JOIN journal_logs l ON l.book_id = b.id AND l.user_id = b.user_id
                WHERE b.user_id = %s
                GROUP BY b.id
                ORDER BY b.created_at ASC
                """,
                (user_id,),
            )
            rows = cur.fetchall()
    return [_book_to_dict(r) for r in rows]


def create_book(user_id: int, name: str, color: str = "") -> dict[str, Any]:
    cleaned = name.strip()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO journal_books (user_id, name, color, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, name) DO UPDATE SET color = EXCLUDED.color
                RETURNING id, name, color, created_at
                """,
                (user_id, cleaned, color, utc_now()),
            )
            row = cur.fetchone()
        conn.commit()
    row["entry_count"] = 0
    return _book_to_dict(row)


def delete_book(user_id: int, book_id: int) -> bool:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE journal_logs SET book_id = NULL WHERE user_id = %s AND book_id = %s",
                (user_id, book_id),
            )
            cur.execute(
                "DELETE FROM journal_books WHERE user_id = %s AND id = %s",
                (user_id, book_id),
            )
            ok = cur.rowcount > 0
        conn.commit()
    return ok


def compute_streak(user_id: int) -> dict[str, Any]:
    """Daily journal streak across all books.

    `current` = consecutive days ending today (if there's an entry today) or yesterday.
    `longest` = longest run ever seen.
    `wrote_today` = whether the user has at least one entry dated today.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT entry_date
                FROM journal_logs
                WHERE user_id = %s
                ORDER BY entry_date DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    dates = [r["entry_date"] for r in rows if r.get("entry_date")]
    if not dates:
        return {"current": 0, "longest": 0, "wrote_today": False, "last_entry_date": None}

    from datetime import date as _date, timedelta as _td

    today = _date.today()
    last_entry_date = dates[0]
    wrote_today = last_entry_date == today

    # current streak — count back from today (or yesterday)
    cursor = today if wrote_today else today - _td(days=1)
    date_set = set(dates)
    current = 0
    while cursor in date_set:
        current += 1
        cursor = cursor - _td(days=1)

    # longest streak — sort ascending and walk
    longest = 0
    run = 0
    sorted_dates = sorted(date_set)
    prev = None
    for d in sorted_dates:
        if prev is not None and (d - prev).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)
        prev = d

    last_7 = []
    for offset in range(6, -1, -1):
        day = today - _td(days=offset)
        last_7.append({
            "date": day.isoformat(),
            "has_entry": day in date_set,
            "is_today": day == today,
        })

    return {
        "current": current,
        "longest": longest,
        "wrote_today": wrote_today,
        "last_entry_date": last_entry_date.isoformat(),
        "last_7": last_7,
    }


def ensure_default_book(user_id: int) -> dict[str, Any]:
    books = list_books(user_id)
    if books:
        return books[0]
    return create_book(user_id, "Daily journal", color="var(--accent)")


# ---------- entries ----------

def list_journal_entries(user_id: int, book_id: int | None = None, limit: int = 200) -> list[dict[str, Any]]:
    query = """
        SELECT id, book_id, entry_date, mood_emoji, mood_label, body, translated, created_at, updated_at
        FROM journal_logs
        WHERE user_id = %s
    """
    params: list[Any] = [user_id]
    if book_id is not None:
        query += " AND book_id = %s"
        params.append(book_id)
    query += " ORDER BY entry_date DESC, created_at DESC LIMIT %s"
    params.append(limit)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
    return [_entry_to_dict(r) for r in rows]


def get_journal_entry(user_id: int, entry_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, book_id, entry_date, mood_emoji, mood_label, body, translated, created_at, updated_at
                FROM journal_logs
                WHERE user_id = %s AND id = %s
                """,
                (user_id, entry_id),
            )
            row = cur.fetchone()
    return _entry_to_dict(row) if row else None


def create_journal_entry(
    user_id: int,
    *,
    entry_date: date_type,
    mood_emoji: str,
    mood_label: str,
    body: str,
    translated: str = "",
    book_id: int | None = None,
) -> dict[str, Any]:
    now = utc_now()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO journal_logs
                    (user_id, book_id, entry_date, mood_emoji, mood_label, body, translated, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, book_id, entry_date, mood_emoji, mood_label, body, translated, created_at, updated_at
                """,
                (user_id, book_id, entry_date, mood_emoji, mood_label, body, translated, now, now),
            )
            row = cur.fetchone()
        conn.commit()
    return _entry_to_dict(row)


def update_journal_entry(
    user_id: int,
    entry_id: int,
    *,
    mood_emoji: str | None = None,
    mood_label: str | None = None,
    body: str | None = None,
    translated: str | None = None,
    book_id: int | None | str = "__missing__",
) -> dict[str, Any] | None:
    fields: list[str] = []
    values: list[Any] = []
    if mood_emoji is not None:
        fields.append("mood_emoji = %s"); values.append(mood_emoji)
    if mood_label is not None:
        fields.append("mood_label = %s"); values.append(mood_label)
    if body is not None:
        fields.append("body = %s"); values.append(body)
    if translated is not None:
        fields.append("translated = %s"); values.append(translated)
    if book_id != "__missing__":
        fields.append("book_id = %s"); values.append(book_id)
    if not fields:
        return get_journal_entry(user_id, entry_id)
    fields.append("updated_at = %s"); values.append(utc_now())
    values.extend([user_id, entry_id])
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE journal_logs SET {', '.join(fields)}
                WHERE user_id = %s AND id = %s
                RETURNING id, book_id, entry_date, mood_emoji, mood_label, body, translated, created_at, updated_at
                """,
                tuple(values),
            )
            row = cur.fetchone()
        conn.commit()
    return _entry_to_dict(row) if row else None


def delete_journal_entry(user_id: int, entry_id: int) -> bool:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM journal_logs WHERE user_id = %s AND id = %s",
                (user_id, entry_id),
            )
            ok = cur.rowcount > 0
        conn.commit()
    return ok


def translate_entry(body: str, mood_emoji: str, mood_label: str) -> str:
    cleaned = (body or "").strip()
    if not cleaned:
        return ""
    try:
        from nextmate_agent.utils.llm import get_chat_model, invoke_with_logging

        llm = get_chat_model()
        system_prompt = (
            "You are a gentle, warm journaling companion. Rewrite the user's short journal entry "
            "as a flowing 2-4 sentence first-person reflection in natural English. Preserve facts "
            "and feelings; do not add new ones. Weave in the mood naturally. No clichés, no advice."
        )
        user_prompt = f"Mood: {mood_emoji} {mood_label}\n\nEntry:\n{cleaned}\n\nReturn only the reflection."
        content, _ = invoke_with_logging(
            llm,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            node_name="journal_translate",
        )
        return (content or "").strip()
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("journal translate failed: %s", exc)
        prefix = f"Today felt {mood_label.lower()}. " if mood_label else ""
        return prefix + cleaned