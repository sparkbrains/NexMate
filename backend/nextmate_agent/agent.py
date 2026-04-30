import atexit
import threading

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.postgres import PostgresSaver

from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.nodes import (
    build_memory_context_node,
    generate_reply_node,
    load_memory_node,
    persist_summary_node,
    summarize_turn_node,
)
from nextmate_agent.utils.state import NextMateState


_lock = threading.Lock()
_checkpointer_cm = None
_checkpointer = None
_graph = None
_reply_graph = None
_summary_graph = None


def checkpoint_thread_id(user_id: int, thread_id: str) -> str:
    return f"user:{user_id}:thread:{thread_id}"


def _get_checkpointer() -> PostgresSaver:
    global _checkpointer_cm, _checkpointer

    with _lock:
        if _checkpointer is None:
            database_url = get_settings().database_url
            if not database_url:
                raise RuntimeError("DATABASE_URL is required for LangGraph Postgres checkpointing")
            _checkpointer_cm = PostgresSaver.from_conn_string(database_url)
            _checkpointer = _checkpointer_cm.__enter__()
            _checkpointer.setup()
    return _checkpointer


def close_checkpointer() -> None:
    global _checkpointer_cm, _checkpointer

    with _lock:
        if _checkpointer_cm is not None:
            _checkpointer_cm.__exit__(None, None, None)
            _checkpointer_cm = None
            _checkpointer = None


atexit.register(close_checkpointer)


def _build_graph(checkpointer: PostgresSaver | None):
    builder = StateGraph(NextMateState)
    builder.add_node("load_memory", load_memory_node)
    builder.add_node("build_memory_context", build_memory_context_node)
    builder.add_node("generate_reply", generate_reply_node)
    builder.add_node("summarize_turn", summarize_turn_node)
    builder.add_node("persist_summary", persist_summary_node)

    builder.add_edge(START, "load_memory")
    builder.add_edge("load_memory", "build_memory_context")
    builder.add_edge("build_memory_context", "generate_reply")
    builder.add_edge("generate_reply", "summarize_turn")
    builder.add_edge("summarize_turn", "persist_summary")
    builder.add_edge("persist_summary", END)
    return builder.compile(checkpointer=checkpointer)


def _build_reply_graph(checkpointer: PostgresSaver):
    builder = StateGraph(NextMateState)
    builder.add_node("load_memory", load_memory_node)
    builder.add_node("build_memory_context", build_memory_context_node)
    builder.add_node("generate_reply", generate_reply_node)

    builder.add_edge(START, "load_memory")
    builder.add_edge("load_memory", "build_memory_context")
    builder.add_edge("build_memory_context", "generate_reply")
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
