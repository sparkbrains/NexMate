# NextMate Architecture (LangGraph)

## Goal
Build a flow-based AI journaling companion where behavior comes from graph orchestration and prompts, not hardcoded heuristics.

## Graph Flow
1. `load_memory`
2. `build_memory_context`
3. `generate_reply`
4. `summarize_turn`
5. `persist_summary`

## Persistence
- Graph compiled with a Postgres checkpointer (`PostgresSaver`).
- Every invoke passes an internal checkpoint key plus `configurable.user_id`.
- Thread state checkpoints are saved per user-thread and resumed on next invoke.
- Turn summaries, thread messages, users, and sessions are stored in Postgres tables.
- App-owned Postgres tables are versioned with Alembic migrations in `backend/alembic/`.

## Code Layout
- `backend/nextmate_agent/agent.py`: graph wiring.
- `backend/nextmate_agent/utils/state.py`: `NextMateState`.
- `backend/nextmate_agent/utils/nodes.py`: node handlers.
- `backend/nextmate_agent/utils/prompts.py`: assistant + summary prompts.
- `backend/apps/db.py`: Postgres connection bootstrap and schema setup.
- `backend/apps/api/`: auth/dashboard/thread/ws API.
- `backend/langgraph.json`: LangGraph deployment/local config.

## Memory Strategy
- Persist one structured summary per turn in `journal_entries`.
- Feed recent summaries back into context for better continuity.
- Keep summaries compact so model context stays stable and cheap.

## Next Steps
- Add safety-specific branch node for high-risk language.
- Add tool nodes (calendar, reminders, habits) when needed.
- Add API + frontend once graph behavior is stable.
