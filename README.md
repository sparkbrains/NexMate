# NextMate

NextMate is an AI-first journaling companion built with LangGraph.
The flow is graph-based and prompt-driven:
1. load memory,
2. build context,
3. generate assistant response,
4. generate memory summary,
5. persist summary.

Persistence is enabled with PostgreSQL:
- LangGraph checkpoints use a Postgres checkpointer.
- App data (users, sessions, thread messages, summaries) is stored in Postgres tables.

## Structure

- `backend/`: FastAPI + LangGraph backend.
  - `backend/apps/web_app.py`: FastAPI app wiring.
  - `backend/apps/api/routers/`: HTTP, auth, dashboard, and WebSocket route handlers.
  - `backend/apps/api/services/`: auth, dashboard KPI, thread storage, and chat orchestration.
  - `backend/apps/db.py`: Postgres connection and table bootstrap.
  - `backend/alembic/`: Alembic migration history for app-owned Postgres tables.
  - `backend/nextmate_agent/`: LangGraph graph + nodes + prompts.
- `frontend/`: React (Vite) app with login/signup, dashboard KPIs, thread sidebar, and chat.
- `docs/`: architecture notes.

## Environment Profiles

Backend loads env files in this order:
1. `backend/.env` (base)
2. `backend/.env.{APP_ENV}` (profile override, defaults to `local`)

Profile files in repo:
- `backend/.env.local`: local dev defaults, includes dummy user seeding.
- `backend/.env.prod`: production-like defaults, dummy seeding disabled.

Local seeded test users (when `APP_ENV=local` and `SEED_DUMMY_USERS=true`):
- `demo@nextmate.local / demo123`
- `qa@nextmate.local / demo123`

Recommended usage:
- Local: `cp backend/.env.local backend/.env`
- Prod-like: `cp backend/.env.prod backend/.env`

## Run Local CLI

1. Install dependencies:
   `cd backend`
   `pip install -r requirements.txt`
2. Set backend env:
   `cp .env.local .env`
   - `OPENROUTER_API_KEY`
   - `GENERATION_MODEL` (optional)
   - `DATABASE_URL`
3. Start:
   `python3 apps/cli_chat.py`

At launch, choose a `thread_id`. Reusing the same `thread_id` resumes that thread's memory.
You can switch at runtime with `/thread <id>`.

## Run Backend API

1. Install dependencies:
   `cd backend`
   `pip install -r requirements.txt`
2. Configure backend env:
   `cp .env.local .env`
   - `OPENROUTER_API_KEY`
   - `DATABASE_URL`
   - `ALLOWED_ORIGINS` (optional)
3. Start server:
   `python3 apps/web_app.py`

## Database Migrations

Alembic manages the app-owned Postgres tables:
- `users`
- `sessions`
- `thread_messages`
- `journal_entries`

LangGraph checkpoint tables are still managed by `PostgresSaver`, not by Alembic.

Fresh database:
1. Start Postgres only:
   `docker compose up -d postgres`
2. Run app migrations:
   `docker compose run --rm backend alembic upgrade head`
3. Start the full app:
   `docker compose up --build`

Existing database that already has app tables created by the old runtime bootstrap path:
1. Start Postgres only:
   `docker compose up -d postgres`
2. Mark the current schema as managed by Alembic:
   `docker compose run --rm backend alembic stamp head`
3. Verify revision if needed:
   `docker compose run --rm backend alembic current`
4. Start the full app:
   `docker compose up --build`

Local non-Docker commands:
- Fresh DB:
  `cd backend && alembic upgrade head`
- Already bootstrapped DB:
  `cd backend && alembic stamp head`
- Check current revision:
  `cd backend && alembic current`

## Run React Frontend

1. Move to frontend:
   `cd frontend`
2. Install packages:
   `npm install`
3. Set env:
   `cp .env.example .env`
4. Start:
   `npm run dev`
5. Open:
   `http://127.0.0.1:5173`

## Run With Docker (Recommended Team Setup)

1. Configure backend env once:
   `cp backend/.env.local backend/.env`
   Update at least `OPENROUTER_API_KEY` and `DATABASE_URL` in `backend/.env`.
2. For a fresh DB, initialize schema first:
   `docker compose up -d postgres`
   `docker compose run --rm backend alembic upgrade head`
3. If the DB already exists from the old bootstrap flow, stamp it once instead:
   `docker compose up -d postgres`
   `docker compose run --rm backend alembic stamp head`
4. Build and run:
   `docker compose up --build`
5. Open:
   - Frontend: `http://127.0.0.1:5173`
   - Backend API: `http://127.0.0.1:8000`
   - PostgreSQL: `localhost:5433`

Useful commands:
- Stop: `docker compose down`
- Rebuild clean: `docker compose build --no-cache`
- Check Alembic revision: `docker compose run --rm backend alembic current`

## Run Individual Containers (Optional)

Backend:
1. `docker build -f Dockerfile.backend -t nextmate-backend ./backend`
2. `docker run --rm -p 8000:8000 --env-file backend/.env nextmate-backend`

Frontend:
1. `docker build -f Dockerfile.frontend -t nextmate-frontend ./frontend`
2. `docker run --rm -p 5173:5173 -e VITE_API_BASE_URL=http://127.0.0.1:8000 nextmate-frontend`

## UX Flow

- Login / Signup
- User-specific dashboard KPIs (`/api/dashboard/kpis`)
- User-specific threads and chat history
- WebSocket chat streaming with auth token (`/ws/chat/{thread_id}?token=...`)
