import asyncio
from typing import Any

from nextmate_agent.agent import reply_graph, summary_graph


async def generate_assistant_reply(thread_id: str, user_message: str) -> tuple[str, dict[str, Any]]:
    payload = await asyncio.to_thread(
        reply_graph.invoke,
        {"user_input": user_message},
        {"configurable": {"thread_id": thread_id}},
    )
    assistant_reply = str(payload.get("assistant_reply", "")).strip()
    asyncio.create_task(
        _persist_summary_background(
            thread_id=thread_id,
            user_message=user_message,
            assistant_reply=assistant_reply,
        )
    )
    return assistant_reply, {}


async def _persist_summary_background(thread_id: str, user_message: str, assistant_reply: str) -> None:
    try:
        await asyncio.to_thread(
            summary_graph.invoke,
            {
                "user_input": user_message,
                "assistant_reply": assistant_reply,
            },
            {"configurable": {"thread_id": thread_id}},
        )
    except Exception:
        # Background summary failures should not block chat delivery.
        return
