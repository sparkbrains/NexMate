import os
import logging
from typing import Any, AsyncGenerator

from docx import Document
from groq import AsyncGroq
from dotenv import load_dotenv
load_dotenv()
logger = logging.getLogger(__name__)

_client: AsyncGroq | None = None


def get_groq_client() -> AsyncGroq:
    """Separate client/key from the main reflection LLM on purpose -- the
    support bot is a distinct product surface (public, unauthenticated,
    product-FAQ only) and shouldn't share rate limits, cost tracking, or
    credentials with the core chat/journaling agent.
    """
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_SUPPORT_API_KEY") or os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_SUPPORT_API_KEY (or GROQ_API_KEY) is required for the support bot"
            )
        _client = AsyncGroq(api_key=api_key)
    return _client


SUPPORT_MODEL = os.getenv("GROQ_SUPPORT_MODEL", "")


# ---------------------------------------------------------------------------
# Product knowledge now lives in a .docx instead of hardcoded strings, so
# whoever owns pricing/features can update the bot's knowledge by editing a
# Word doc -- no code change or redeploy needed (the file is re-read
# whenever its mtime changes).
#
# Expected structure (see the provided nextmate_support_content.docx):
#   Heading 1 "Features" -> bullet list
#   Heading 1 "Pricing"  -> Heading 2 per plan, each followed by a bullet list
# The parser below doesn't actually require that exact structure to work --
# it linearizes headings and bullets in order -- but keeping it means the
# doc stays easy for a human to read and edit too.
# ---------------------------------------------------------------------------

DEFAULT_CONTENT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "content", "nextmate_support_content.docx"
)

_content_cache: dict[str, Any] = {"mtime": None, "text": ""}


def _extract_docx_text(path: str) -> str:
    doc = Document(path)
    lines: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = (para.style.name or "").lower() if para.style else ""
        if "title" in style:
            lines.append(f"# {text}")
        elif "heading 1" in style:
            lines.append(f"\n## {text}")
        elif "heading" in style:
            lines.append(f"\n### {text}")
        elif text.startswith(("-", "\u2022")):
            stripped_text = text.lstrip('-\u2022').strip()
            lines.append(f"- {stripped_text}")
        elif "list" in style:
            lines.append(f"- {text}")
        else:
            lines.append(text)

    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                lines.append(" | ".join(cells))

    return "\n".join(lines)


def get_support_content() -> str:
    """Returns the current product-knowledge text, re-parsing the docx only
    when it has changed on disk. Falls back to the last successfully
    parsed content (or an empty string) if the file is missing or
    unreadable, so a bad edit or a temporarily-unmounted volume doesn't
    take the whole support bot down.
    """
    path = os.getenv("SUPPORT_CONTENT_DOCX_PATH", DEFAULT_CONTENT_PATH)
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        logger.warning("support content docx not found at %s; using cached content", path)
        return _content_cache["text"]

    if _content_cache["mtime"] != mtime:
        try:
            _content_cache["text"] = _extract_docx_text(path)
            _content_cache["mtime"] = mtime
        except Exception as exc:  # noqa: BLE001
            logger.exception("failed to parse support content docx at %s: %s", path, exc)

    return _content_cache["text"]


def build_system_prompt() -> str:
    content = get_support_content()
    if not content:
        content = (
            "(No product content is currently loaded. Tell the user you're "
            "unable to answer product questions right now and to contact "
            "support@nexmate.local.)"
        )

    return f"""You are the customer support assistant for Nexmate, a
reflective journaling app. Answer questions about what Nexmate does, how
its features work, and its pricing, using ONLY the information below. Be
warm, concise, and clear -- this is a support widget, not a therapy chat.

CRITICAL:
1. Do NOT copy-paste large portions of the reference content verbatim.
2. Keep your answer extremely concise, direct, and to the point.
3. Limit your response to 1 to 3 sentences maximum unless the user explicitly asks for elaboration or details.
4. Do NOT elaborate, add extra background details, or include unasked-for information.

If someone brings up something emotionally heavy or asks for clinical or
therapeutic advice, gently redirect: tell them Nexmate itself (the actual
app) is the place for that kind of reflection, and that you, the support
bot, are only here to help with questions about the product itself.

If asked something you don't have information on (exact uptime, unpublished
roadmap, account-specific billing issues, refunds, etc.), say so plainly and
point them to support@nexmate.local -- never invent details, especially
pricing or feature specifics not listed below.

=== NEXMATE PRODUCT INFO ===
{content}
"""


async def stream_support_reply(history: list[dict[str, str]]) -> AsyncGenerator[str, None]:
    """history: list of {"role": "user"|"assistant", "content": str}
    Yields text chunks as they arrive from Groq.
    """
    client = get_groq_client()
    messages = [{"role": "system", "content": build_system_prompt()}] + history
    stream = await client.chat.completions.create(
        model=SUPPORT_MODEL,
        messages=messages,
        stream=True,
        temperature=0.4,
        max_tokens=600,
    )
    async for chunk in stream:
        choices = chunk.choices
        if not choices:
            continue
        delta = choices[0].delta.content
        if delta:
            yield delta