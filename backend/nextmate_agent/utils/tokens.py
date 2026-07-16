"""Token estimation utility.

Groq doesn't expose a public per-model tokenizer, so we use tiktoken's
cl100k_base encoding as a consistent proxy for budgeting decisions (when to
trigger thread compaction, etc). This will not exactly match Groq's billed
token counts for Llama/Scout models, but is consistent and close enough for
threshold decisions — use the real counts in data/logs/token_usage.log for
anything that needs to be exact.
"""
import tiktoken

_enc = tiktoken.get_encoding("cl100k_base")


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    try:
        return len(_enc.encode(text))
    except Exception:
        # Fallback if encoding chokes on unusual input — rough chars/4 estimate
        return max(1, len(text) // 4)


def estimate_chat_history_tokens(chat_history: list[dict]) -> int:
    if not chat_history:
        return 0
    full_text = "\n".join(
        f"{msg.get('role', '')}: {msg.get('content', '')}" for msg in chat_history
    )
    return estimate_tokens(full_text)