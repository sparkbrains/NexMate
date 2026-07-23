import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    llm_api_key: str | None
    generation_model: str
    fast_model: str
    app_referer: str
    app_title: str
    summary_store_path: str
    checkpoint_db_path: str
    memory_window: int
    loop_store_path: str
    database_url: str | None
    thread_summary_trigger_tokens: int
    thread_summary_keep_last_turns: int
    cross_thread_context_token_budget: int
    digest_token_target: int
    detect_loops_cross_thread_prompt_limit: int
    detect_loops_max_prompt_tokens: int
    idle_thread_summary_minutes: int
    max_stale_threads_per_turn: int


def get_settings() -> Settings:
    api_key = os.getenv("GOOGLE_API_KEY")

    return Settings(
        llm_api_key=api_key,
        generation_model=os.getenv("GENERATION_MODEL"),

        fast_model=os.getenv("FAST_MODEL"),
        app_referer=os.getenv("APP_REFERER", "http://localhost:8000"),
        app_title=os.getenv("APP_TITLE", "nexmate"),
        summary_store_path=os.getenv("SUMMARY_STORE_PATH", "data/memory/summaries.jsonl"),
        checkpoint_db_path=os.getenv("CHECKPOINT_DB_PATH", "data/memory/checkpoints.sqlite"),
        memory_window=int(os.getenv("MEMORY_WINDOW", "20")),
        loop_store_path=os.getenv("LOOP_STORE_PATH", "data/memory/loops.jsonl"),
        database_url=os.getenv("DATABASE_URL"),
        # Trigger PER-THREAD compaction once a single thread's chat_history
        # estimates above this many tokens. Keeps generate_reply's prompt
        # bounded regardless of how long one conversation runs.
        thread_summary_trigger_tokens=int(os.getenv("THREAD_SUMMARY_TRIGGER_TOKENS", "1800")),
        # How many of the most recent turns to keep verbatim in a thread after
        # compaction. Everything older gets folded into that thread's own summary.
        thread_summary_keep_last_turns=int(os.getenv("THREAD_SUMMARY_KEEP_LAST_TURNS", "4")),
        # CROSS-thread budget: how many tokens of "other threads" context (active
        # thread summaries + digest combined) get injected into a NEW thread's
        # memory_context. Kept deliberately small relative to the 6,000 TPM free
        # tier cap -- this rides on top of the existing per-turn token spend.
        cross_thread_context_token_budget=int(os.getenv("CROSS_THREAD_CONTEXT_TOKEN_BUDGET", "800")),
        # Target size for the rolling memory_digest itself. The digest re-compresses
        # itself to stay under this every time new material folds in, so it doesn't
        # grow unboundedly as more threads age out over time.
        digest_token_target=int(os.getenv("DIGEST_TOKEN_TARGET", "400")),
        # detect_loops prompt caps: how many cross-thread entries get RENDERED
        # into the LLM prompt. Deterministic validation afterward still checks
        # against the FULL fetched set (150 rows) at zero token cost -- this only
        # limits what the initial pattern-spotting call actually sees.
        detect_loops_cross_thread_prompt_limit=int(os.getenv("DETECT_LOOPS_CROSS_THREAD_PROMPT_LIMIT", "12")),
        # Hard ceiling on detect_loops' full prompt (system + cross-thread +
        # current-thread + user_input). Sized so, combined with
        # detect_explicit_advice + choose_response_mode + summarize_turn in the
        # same turn, total stays under Instant's 6,000 TPM free-tier cap.
        detect_loops_max_prompt_tokens=int(os.getenv("DETECT_LOOPS_MAX_PROMPT_TOKENS", "2200")),
        # IDLE-SWEEP settings: how long a thread must be quiet before it's
        # eligible for opportunistic summarization (runs on every turn for
        # OTHER threads, never the active one -- see manage_cross_thread_memory_node).
        # This is what actually populates thread_summaries for short threads
        # that never trip thread_summary_trigger_tokens.
        idle_thread_summary_minutes=int(os.getenv("IDLE_THREAD_SUMMARY_MINUTES", "10")),
        # Cap on how many stale threads get summarized in a single turn, to
        # avoid a burst of fast-model calls if a user has many idle threads at
        # once. Leftover stale threads are picked up on a later turn.
        max_stale_threads_per_turn=int(os.getenv("MAX_STALE_THREADS_PER_TURN", "2")),
    )