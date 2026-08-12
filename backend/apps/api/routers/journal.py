from datetime import datetime
from datetime import date as date_type
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.journal_log_service import (
    compute_streak,
    create_book,
    create_journal_entry,
    delete_book,
    delete_journal_entry,
    ensure_default_book,
    get_journal_entry,
    list_books,
    list_journal_entries,
    translate_entry,
    update_book,
    update_journal_entry,
    upsert_journal_entry_for_thread,
)
from apps.api.services.journal_loop_service import extract_features_and_detect_loops


router = APIRouter(prefix="/api/journal", tags=["journal"])


# ---------- books ----------

class CreateBookRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: str = Field("", max_length=40)


class UpdateBookRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    color: str = Field("", max_length=40)


@router.get("/streak")
def get_streak(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {"streak": compute_streak(current_user.id)}


@router.get("/books")
def get_books(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    books = list_books(current_user.id)
    if not books:
        ensure_default_book(current_user.id)
        books = list_books(current_user.id)
    return {"books": books}


@router.post("/books")
def add_book(req: CreateBookRequest, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    book = create_book(current_user.id, req.name, req.color)
    return {"book": book}


@router.patch("/books/{book_id}")
def edit_book(book_id: int, req: UpdateBookRequest, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    book = update_book(current_user.id, book_id, req.name, req.color)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return {"book": book}


@router.delete("/books/{book_id}")
def remove_book(book_id: int, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    ok = delete_book(current_user.id, book_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Book not found")
    return {"id": book_id, "deleted": True}


# ---------- entries ----------

class TranslateRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    mood_emoji: str = Field("", max_length=8)
    mood_label: str = Field("", max_length=40)


class CreateEntryRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    mood_emoji: str = Field("", max_length=8)
    mood_label: str = Field("", max_length=40)
    entry_date: str | None = None
    translated: str = ""
    auto_translate: bool = False
    book_id: int | None = None
    allow_loop_detection: bool = True
    bg_image: str = Field("", max_length=500)


class UpdateEntryRequest(BaseModel):
    body: str | None = Field(None, max_length=5000)
    mood_emoji: str | None = Field(None, max_length=8)
    mood_label: str | None = Field(None, max_length=40)
    translated: str | None = Field(None, max_length=5000)
    book_id: int | None = None
    allow_loop_detection: bool | None = None
    bg_image: str | None = Field(None, max_length=500)


class SaveThreadSummaryRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    thread_id: str = Field(..., min_length=1)
    book_id: int | None = None


def _parse_entry_date(value: str | None) -> date_type:
    if not value:
        return datetime.utcnow().date()
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="entry_date must be YYYY-MM-DD") from exc


@router.get("")
def list_entries(
    book_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return {"entries": list_journal_entries(current_user.id, book_id=book_id)}


@router.post("/translate")
def translate(req: TranslateRequest, current_user: User = Depends(get_current_user)) -> dict[str, str]:
    text = translate_entry(req.body, req.mood_emoji, req.mood_label)
    return {"translated": text}


@router.post("/from-thread-summary")
def save_thread_summary_as_journal_entry(
    req: SaveThreadSummaryRequest,
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    body = req.body.strip()
    thread_id = req.thread_id.strip()
    if not body:
        raise HTTPException(status_code=400, detail="body is required")
    if not thread_id:
        raise HTTPException(status_code=400, detail="thread_id is required")

    book_id = req.book_id
    if book_id is None:
        default_book = ensure_default_book(current_user.id)
        book_id = default_book["id"]

    entry = upsert_journal_entry_for_thread(
        current_user.id,
        thread_id,
        entry_date=datetime.utcnow().date(),
        mood_emoji="",
        mood_label="",
        body=body,
        book_id=book_id,
    )
    # Deliberately no background_tasks.add_task(extract_features_and_detect_loops, ...)
    # here -- a generated summary shouldn't feed loop detection like a real entry
    # would. This is belt-and-suspenders with the source_thread_id guard in
    # update_entry() below: even if this entry is later edited through the
    # generic PATCH endpoint, loop detection still won't fire for it.
    return {"entry": entry}


@router.post("")
def create_entry(req: CreateEntryRequest, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    body = req.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="body is required")

    book_id = req.book_id
    if book_id is None:
        default_book = ensure_default_book(current_user.id)
        book_id = default_book["id"]

    translated = (req.translated or "").strip()
    if not translated and req.auto_translate:
        translated = translate_entry(body, req.mood_emoji, req.mood_label)

    entry = create_journal_entry(
        current_user.id,
        entry_date=_parse_entry_date(req.entry_date),
        mood_emoji=req.mood_emoji,
        mood_label=req.mood_label,
        body=body,
        bg_image=req.bg_image,
        translated=translated,
        book_id=book_id,
    )
    if req.allow_loop_detection:
        background_tasks.add_task(extract_features_and_detect_loops, current_user.id, entry["id"])
    return {"entry": entry}


@router.patch("/{entry_id}")
def update_entry(entry_id: int, req: UpdateEntryRequest, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if req.mood_emoji is not None:
        kwargs["mood_emoji"] = req.mood_emoji
    if req.mood_label is not None:
        kwargs["mood_label"] = req.mood_label
    if req.body is not None:
        kwargs["body"] = req.body
    if req.bg_image is not None:
        kwargs["bg_image"] = req.bg_image
    if req.translated is not None:
        kwargs["translated"] = req.translated
    if req.book_id is not None:
        kwargs["book_id"] = req.book_id

    updated = update_journal_entry(current_user.id, entry_id, **kwargs)
    if not updated:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Entries sourced from a chat-summary save (from-thread-summary) must never
    # feed loop detection, even when edited later through this generic PATCH
    # route -- so this check overrides whatever allow_loop_detection was passed.
    is_thread_sourced = bool(updated.get("source_thread_id"))
    if not is_thread_sourced and req.allow_loop_detection is not False:  # default or explicit True
        background_tasks.add_task(extract_features_and_detect_loops, current_user.id, entry_id)
    return {"entry": updated}


@router.delete("/{entry_id}")
def remove_entry(entry_id: int, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    ok = delete_journal_entry(current_user.id, entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"id": entry_id, "deleted": True}


@router.get("/{entry_id}")
def get_entry(entry_id: int, current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    entry = get_journal_entry(current_user.id, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"entry": entry}