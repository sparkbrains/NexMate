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
- Graph compiled with SQLite checkpointer (`SqliteSaver`).
- Every invoke passes `configurable.thread_id`.
- Thread state checkpoints are saved per thread and resumed on next invoke.
- Turn summaries are also written to `data/memory/summaries.jsonl` with `thread_id`.

## Code Layout
- `nextmate_agent/agent.py`: graph wiring.
- `nextmate_agent/utils/state.py`: `NextMateState`.
- `nextmate_agent/utils/nodes.py`: node handlers.
- `nextmate_agent/utils/prompts.py`: assistant + summary prompts.
- `nextmate_agent/utils/memory_store.py`: JSONL storage.
- `langgraph.json`: LangGraph deployment/local config.

## Memory Strategy
- Persist one structured summary per turn in `data/memory/summaries.jsonl`.
- Feed recent summaries back into context for better continuity.
- Keep summaries compact so model context stays stable and cheap.

## Next Steps
- Add safety-specific branch node for high-risk language.
- Add tool nodes (calendar, reminders, habits) when needed.
- Add API + frontend once graph behavior is stable.
