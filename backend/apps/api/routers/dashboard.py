from fastapi import APIRouter, Depends, Query

from apps.api.deps.auth import get_current_user
from apps.api.services.auth_service import User
from apps.api.services.dashboard_service import (
    get_dashboard_insights,
    get_dashboard_kpis,
)
from apps.api.services.daily_question_service import (
    mark_question_answered,
    get_thread_context_for_question,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/kpis")
def kpis(current_user: User = Depends(get_current_user)) -> dict:
    return {"kpis": get_dashboard_kpis(current_user.id)}


@router.get("/insights")
async def insights(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
) -> dict:
    insights_data = await get_dashboard_insights(current_user.id, days=days)
    return {"insights": insights_data}


@router.post("/daily-question/{question_id}/answer")
def answer_daily_question(
    question_id: int,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Answer a daily question by creating a new thread with the question context."""
    from apps.api.services.thread_service import create_thread
    from apps.db import get_connection, utc_now
    
    # Get the question details
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dq.question_text, dq.source_thread_id, dq.source_core_themes
                FROM daily_questions dq
                WHERE dq.id = %s AND dq.user_id = %s AND dq.status = 'pending'
                """,
                (question_id, current_user.id),
            )
            question = cur.fetchone()
            
            if not question:
                return {"success": False, "message": "Question not found or already answered"}
            
            # Mark the question as answered
            success = mark_question_answered(question_id)
            
            # Create a new thread for answering the question
            thread_title = f"Daily Question: {question['question_text'][:50]}..."
            new_thread = create_thread(
                user_id=current_user.id,
                title=thread_title,
                context={
                    "daily_question_id": question_id,
                    "question_text": question["question_text"],
                    "source_thread_id": question["source_thread_id"],
                    "source_core_themes": question["source_core_themes"],
                }
            )
            
            return {
                "success": True,
                "message": "Question answered successfully",
                "thread_id": new_thread["thread_id"],
                "question_text": question["question_text"]
            }


@router.get("/daily-question/{question_id}/context")
def get_question_context(
    question_id: int,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get thread context for answering a daily question."""
    # First get the question to find the source thread
    from apps.db import get_connection
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT source_thread_id FROM daily_questions
                WHERE id = %s AND user_id = %s
                """,
                (question_id, current_user.id),
            )
            question = cur.fetchone()
            
            if not question:
                return {"error": "Question not found"}
            
            thread_id = question["source_thread_id"]
            context = get_thread_context_for_question(current_user.id, thread_id)
            
            return {
                "thread_id": thread_id,
                "context": context,
                "question_id": question_id,
            }