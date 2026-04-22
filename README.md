# NextMate

NextMate is an AI-first journaling companion built with LangGraph.
The flow is graph-based and prompt-driven:
1. load memory,
2. build context,
3. generate assistant response,
4. generate memory summary,
5. persist summary.

Persistence is enabled with a LangGraph SQLite checkpointer, keyed by `thread_id`.

## Structure

- `nextmate_agent/agent.py`: graph definition and compile entrypoint.
- `nextmate_agent/utils/state.py`: graph state schema.
- `nextmate_agent/utils/nodes.py`: LangGraph node functions.
- `nextmate_agent/utils/prompts.py`: AI prompting templates.
- `nextmate_agent/utils/memory_store.py`: JSONL memory persistence.
- `data/memory/checkpoints.sqlite`: LangGraph thread checkpoints.
- `apps/cli_chat.py`: local CLI chat runner.
- `apps/web_app.py`: FastAPI app wiring only (mount + router registration).
- `apps/api/routers/`: HTTP and WebSocket route handlers.
- `apps/api/services/`: thread storage and chat orchestration logic.
- `langgraph.json`: LangGraph app config.
- `data/memory/`: local memory storage.

## Run Local CLI

1. Install dependencies:
   `pip install -r requirements.txt`
2. Set `.env` values:
   - `GROQ_API_KEY` (or `LLM_API_KEY`)
   - `GENERATION_MODEL` (optional, default: `llama-3.1-70b-versatile`)
   - `CHECKPOINT_DB_PATH` (optional)
3. Start:
   `python3 apps/cli_chat.py`

At launch, choose a `thread_id`. Reusing the same `thread_id` resumes that thread's memory.
You can switch at runtime with `/thread <id>`.

## Run Web Chat

1. Install dependencies:
   `pip install -r requirements.txt`
2. Configure `.env`:
   - `GROQ_API_KEY` (or `LLM_API_KEY`)
   - `THREAD_MESSAGE_LOG_PATH` (optional)
3. Start server:
   `python3 apps/web_app.py`
4. Open:
   `http://127.0.0.1:8000`

The web app uses:
- REST for loading threads/history
- WebSocket for live chat replies
- `thread_id` based memory separation
- streamed assistant output (`start/chunk/done` events, word-by-word chunks)
- thread delete support (`DELETE /api/threads/{thread_id}` + UI button)
