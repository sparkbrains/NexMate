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
    update_journal_entry,
)
from apps.api.services.journal_loop_service import extract_features_and_detect_loops


router = APIRouter(prefix="/api/journal", tags=["journal"])


# ---------- books ----------

class CreateBookRequest(BaseModel):
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


class UpdateEntryRequest(BaseModel):
    body: str | None = Field(None, max_length=5000)
    mood_emoji: str | None = Field(None, max_length=8)
    mood_label: str | None = Field(None, max_length=40)
    translated: str | None = Field(None, max_length=5000)
    book_id: int | None = None
    allow_loop_detection: bool | None = None


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
    if req.translated is not None:
        kwargs["translated"] = req.translated
    if req.book_id is not None:
        kwargs["book_id"] = req.book_id

    updated = update_journal_entry(current_user.id, entry_id, **kwargs)
    if not updated:
        raise HTTPException(status_code=404, detail="Entry not found")
    if req.allow_loop_detection is not False:  # default or explicit True
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