import asyncio
import logging
from datetime import date
from typing import Any

from apps.db import get_connection, utc_now
from apps.api.services.dashboard_service import get_dashboard_insights
from nextmate_agent.utils.llm import ainvoke_with_logging, get_chat_model

logger = logging.getLogger(__name__)

_PERIOD_DAYS = {"week": 7, "month": 30}
_PERIOD_LABELS = {"week": "this week", "month": "this month"}


def _period_key_for_today(period_type: str, today: date) -> str:
    if period_type == "week":
        iso_year, iso_week, _ = today.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return today.strftime("%Y-%m")


def _load_cached_sync(user_id: int, period_type: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT summary_text, period_key, generated_date
                FROM insights_summaries
                WHERE user_id = %s AND period_type = %s
                """,
                (user_id, period_type),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "summary_text": row["summary_text"],
        "period_key": row["period_key"],
        "generated_date": row["generated_date"],
    }


def _save_sync(
    user_id: int, period_type: str, period_key: str, summary_text: str, today: date
) -> None:
    now = utc_now()
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO insights_summaries
                    (user_id, period_type, period_key, summary_text, generated_date, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, period_type) DO UPDATE SET
                    period_key = EXCLUDED.period_key,
                    summary_text = EXCLUDED.summary_text,
                    generated_date = EXCLUDED.generated_date,
                    updated_at = EXCLUDED.updated_at
                """,
                (user_id, period_type, period_key, summary_text, today, now, now),
            )


def _fmt_pct_list(items: list[dict[str, Any]], label_key: str, limit: int = 5) -> str:
    if not items:
        return "none recorded"
    return ", ".join(f"{it[label_key]} ({it['pct']}%)" for it in items[:limit])


def _format_insights_for_prompt(data: dict[str, Any]) -> str:
    """Condenses the get_dashboard_insights payload into a compact labeled
    text block for the LLM -- the same aggregates the charts are built
    from, not the raw day-by-day trend (that's more detail than a short
    narrative summary needs)."""
    lines: list[str] = []

    lines.append(f"Journal entries in this window: {data['total_entries']}")
    lines.append(f"Threads: {data['thread_count']}, messages: {data['message_count']}")
    lines.append(f"Check-in streak: {data['checkin_streak_days']} days")

    lines.append(f"Mood mix: {_fmt_pct_list(data['mood_breakdown'], 'mood')}")

    stats = data["intensity_stats"]
    if stats.get("avg") is not None:
        lines.append(
            f"Emotional intensity (1-10): average {stats['avg']}, "
            f"peak {stats.get('peak')} on {stats.get('peak_day') or 'n/a'}, "
            f"low {stats.get('low')} on {stats.get('low_day') or 'n/a'}"
        )

    lines.append(f"Top triggers: {_fmt_pct_list(data['top_triggers'], 'trigger')}")
    lines.append(f"Core beliefs surfacing: {_fmt_pct_list(data['core_beliefs_profile'], 'belief')}")

    themes = data.get("top_core_themes") or []
    if themes:
        lines.append("Recurring themes: " + ", ".join(f"{t['theme']} ({t['count']}x)" for t in themes[:5]))

    growth = data["growth"]
    cur, prev = growth["current"], growth["previous"]
    lines.append(
        f"This window vs previous: entries {cur['entries']} vs {prev['entries']}, "
        f"threads {cur['threads']} vs {prev['threads']}, "
        f"avg intensity {cur['avg_intensity']} vs {prev['avg_intensity']}"
    )

    loops = data["loops"]
    lines.append(
        f"Patterns (loops): {loops['active']} active, {loops['resolved']} resolved, "
        f"{loops['new_in_window']} new this window, mastery {loops['mastery_pct']}%"
    )
    active_loop_names = [l["name"] for l in loops["items"] if l.get("state") != "resolved" and l.get("name")]
    if active_loop_names:
        lines.append("Active pattern names: " + ", ".join(active_loop_names[:5]))

    return "\n".join(lines)


async def _build_summary_llm(period_type: str, formatted_data: str, user_id: int) -> str:
    period_label = _PERIOD_LABELS[period_type]

    system_prompt = f"""You write a short, warm narrative summary of someone's emotional insights dashboard for {period_label}.
This summary is shown directly to the user at the top of their Insights page, above the charts it describes.

You are given the same aggregated numbers the charts on that page are built from (mood mix, intensity trend,
top triggers, core beliefs, recurring themes, and detected patterns/loops). Your job is to explain, in plain
language, what's been happening emotionally and what those graphs mean -- as if a thoughtful friend were
walking them through their own data.

Rules:
- Write 4-6 sentences, second person ("You've been...", "Your intensity peaked on...").
- Reference at least the mood mix, the intensity trend (peak/low), and one trigger or pattern by name.
- Ground every claim strictly in the numbers given -- never invent a mood, trigger, date, or pattern not present.
- No markdown, no headers, no bullet points, no clinical jargon -- plain conversational prose only.
- If the numbers show very little activity, say so gently rather than padding with generic filler.
Return ONLY the summary text, no preamble."""

    user_prompt = f"Insights data for {period_label}:\n\n{formatted_data}\n\nWrite the summary now."

    llm = get_chat_model()
    content, _ = await ainvoke_with_logging(
        llm,
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "insights_summary_generation",
        user_id,
    )
    return content.strip()


def _cached_or_empty_response(cached: dict[str, Any] | None, today: date) -> dict[str, Any]:
    if not cached:
        return {
            "summary_text": "",
            "period_key": None,
            "generated_date": None,
            "generated_today": False,
            "newly_generated": False,
        }
    return {
        "summary_text": cached["summary_text"],
        "period_key": cached["period_key"],
        "generated_date": cached["generated_date"].isoformat(),
        "generated_today": cached["generated_date"] == today,
        "newly_generated": False,
    }


async def get_cached_insights_summary(user_id: int, period_type: str) -> dict[str, Any] | None:
    cached = await asyncio.to_thread(_load_cached_sync, user_id, period_type)
    if not cached:
        return None
    today = date.today()
    return {
        "summary_text": cached["summary_text"],
        "period_key": cached["period_key"],
        "generated_date": cached["generated_date"].isoformat(),
        "generated_today": cached["generated_date"] == today,
    }


async def generate_insights_summary(user_id: int, period_type: str) -> dict[str, Any]:
    """Click-driven entry point for POST /api/dashboard/insights-summary.

    Gated to once per calendar day per period_type: if today's summary
    already exists, returns it unchanged (no LLM call) rather than
    regenerating -- protects against a double-click race even though the
    frontend also disables the button once generated_today is true.
    """
    today = date.today()
    cached = await asyncio.to_thread(_load_cached_sync, user_id, period_type)
    if cached and cached["generated_date"] == today:
        return {
            "summary_text": cached["summary_text"],
            "period_key": cached["period_key"],
            "generated_date": cached["generated_date"].isoformat(),
            "generated_today": True,
            "newly_generated": False,
        }

    days = _PERIOD_DAYS[period_type]
    period_key = _period_key_for_today(period_type, today)

    try:
        data = await get_dashboard_insights(user_id, days=days)
        formatted = await asyncio.to_thread(_format_insights_for_prompt, data)
        summary_text = await _build_summary_llm(period_type, formatted, user_id)
    except Exception:
        logger.exception(
            "Failed to generate insights summary for user_id=%s period_type=%s", user_id, period_type
        )
        return _cached_or_empty_response(cached, today)

    if not summary_text:
        return _cached_or_empty_response(cached, today)

    await asyncio.to_thread(_save_sync, user_id, period_type, period_key, summary_text, today)

    return {
        "summary_text": summary_text,
        "period_key": period_key,
        "generated_date": today.isoformat(),
        "generated_today": True,
        "newly_generated": True,
    }