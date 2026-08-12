import atexit
import threading

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.postgres import PostgresSaver

from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.nodes import (
    build_memory_context_node,
    choose_response_mode_node,
    detect_loops_node,
    generate_reply_node,
    load_memory_node,
    manage_cross_thread_memory_node,
    manage_thread_summary_node,
    persist_summary_node,
    summarize_turn_node,
)
from nextmate_agent.utils.state import NextMateState


def _should_detect_loops(state: NextMateState) -> str:
    """Route to detect_loops when there are enough memory entries or seeded loops."""
    entries = state.get("memory_entries", [])
    cross_threads = state.get("active_thread_summaries", [])
    stored_loops = state.get("stored_loops", [])
    if len(entries) >= 2 or len(cross_threads) >= 2 or stored_loops:
        return "detect_loops"
    return "choose_response_mode"

_lock = threading.Lock()
_checkpointer_pool: ConnectionPool | None = None
_checkpointer = None
_graph = None
_reply_graph = None
_summary_graph = None


def checkpoint_thread_id(user_id: int, thread_id: str) -> str:
    return f"user:{user_id}:thread:{thread_id}"


def _get_checkpointer() -> PostgresSaver:
    global _checkpointer_pool, _checkpointer

    with _lock:
        if _checkpointer is None:
            database_url = get_settings().database_url
            if not database_url:
                raise RuntimeError("DATABASE_URL is required for LangGraph Postgres checkpointing")
            # PostgresSaver serializes every DB call through its own internal
            # lock regardless of connection type, so a pool doesn't add
            # concurrency here -- what it adds is resilience. A single raw
            # Connection that drops (DB restart, network blip) stays dead for
            # the rest of the process's life, breaking every chat turn until
            # a manual restart; psycopg_pool detects a bad connection and
            # replaces it automatically.
            _checkpointer_pool = ConnectionPool(
                conninfo=database_url,
                min_size=1,
                max_size=4,
                kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
            )
            _checkpointer = PostgresSaver(_checkpointer_pool)
            _checkpointer.setup()
    return _checkpointer


def close_checkpointer() -> None:
    global _checkpointer_pool, _checkpointer

    with _lock:
        if _checkpointer_pool is not None:
            _checkpointer_pool.close()
            _checkpointer_pool = None
            _checkpointer = None


atexit.register(close_checkpointer)


def _build_graph(checkpointer: PostgresSaver | None):
    builder = StateGraph(NextMateState)
    builder.add_node("load_memory", load_memory_node)
    builder.add_node("manage_thread_summary", manage_thread_summary_node)
    builder.add_node("manage_cross_thread_memory", manage_cross_thread_memory_node)
    builder.add_node("build_memory_context", build_memory_context_node)
    builder.add_node("detect_loops", detect_loops_node)
    builder.add_node("choose_response_mode", choose_response_mode_node)
    builder.add_node("generate_reply", generate_reply_node)
    builder.add_node("summarize_turn", summarize_turn_node)
    builder.add_node("persist_summary", persist_summary_node)

    builder.add_edge(START, "load_memory")
    builder.add_edge("load_memory", "manage_thread_summary")
    builder.add_edge("manage_thread_summary", "manage_cross_thread_memory")
    builder.add_edge("manage_cross_thread_memory", "build_memory_context")
    builder.add_conditional_edges(
        "build_memory_context",
        _should_detect_loops,
        {"detect_loops": "detect_loops", "choose_response_mode": "choose_response_mode"},
    )
    builder.add_edge("detect_loops", "choose_response_mode")
    builder.add_edge("choose_response_mode", "generate_reply")
    builder.add_edge("generate_reply", "summarize_turn")
    builder.add_edge("summarize_turn", "persist_summary")
    builder.add_edge("persist_summary", END)
    return builder.compile(checkpointer=checkpointer)


def _build_reply_graph(checkpointer: PostgresSaver):
    builder = StateGraph(NextMateState)
    builder.add_node("load_memory", load_memory_node)
    builder.add_node("manage_thread_summary", manage_thread_summary_node)
    builder.add_node("manage_cross_thread_memory", manage_cross_thread_memory_node)
    builder.add_node("build_memory_context", build_memory_context_node)
    builder.add_node("detect_loops", detect_loops_node)
    builder.add_node("choose_response_mode", choose_response_mode_node)
    builder.add_node("generate_reply", generate_reply_node)

    builder.add_edge(START, "load_memory")
    builder.add_edge("load_memory", "manage_thread_summary")
    builder.add_edge("manage_thread_summary", "manage_cross_thread_memory")
    builder.add_edge("manage_cross_thread_memory", "build_memory_context")
    builder.add_conditional_edges(
        "build_memory_context",
        _should_detect_loops,
        {"detect_loops": "detect_loops", "choose_response_mode": "choose_response_mode"},
    )
    builder.add_edge("detect_loops", "choose_response_mode")
    builder.add_edge("choose_response_mode", "generate_reply")
    builder.add_edge("generate_reply", END)
    return builder.compile(checkpointer=checkpointer)


def _build_summary_graph():
    builder = StateGraph(NextMateState)
    builder.add_node("summarize_turn", summarize_turn_node)
    builder.add_node("persist_summary", persist_summary_node)

    builder.add_edge(START, "summarize_turn")
    builder.add_edge("summarize_turn", "persist_summary")
    builder.add_edge("persist_summary", END)
    return builder.compile()


def get_graph():
    global _graph
    if _graph is None:
        _graph = _build_graph(_get_checkpointer())
    return _graph


def get_reply_graph():
    global _reply_graph
    if _reply_graph is None:
        _reply_graph = _build_reply_graph(_get_checkpointer())
    return _reply_graph


def get_summary_graph():
    global _summary_graph
    if _summary_graph is None:
        _summary_graph = _build_summary_graph()
    return _summary_graph


def delete_thread_checkpoints(user_id: int, thread_id: str) -> None:
    _get_checkpointer().delete_thread(checkpoint_thread_id(user_id, thread_id))