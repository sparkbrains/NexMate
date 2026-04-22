import os
import sqlite3

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver

from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.nodes import (
    build_memory_context_node,
    choose_response_mode_node,
    detect_loops_node,
    generate_reply_node,
    load_memory_node,
    persist_summary_node,
    summarize_turn_node,
)
from nextmate_agent.utils.state import NextMateState


def _build_checkpointer() -> SqliteSaver:
    settings = get_settings()
    db_path = settings.checkpoint_db_path
    parent_dir = os.path.dirname(db_path)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
    connection = sqlite3.connect(db_path, check_same_thread=False)
    checkpointer = SqliteSaver(connection)
    if hasattr(checkpointer, "setup"):
        checkpointer.setup()
    return checkpointer


def build_graph():
    builder = StateGraph(NextMateState)
    builder.add_node("load_memory", load_memory_node)
    builder.add_node("build_memory_context", build_memory_context_node)
    builder.add_node("detect_loops", detect_loops_node)
    builder.add_node("choose_response_mode", choose_response_mode_node)
    builder.add_node("generate_reply", generate_reply_node)
    builder.add_node("summarize_turn", summarize_turn_node)
    builder.add_node("persist_summary", persist_summary_node)

    builder.add_edge(START, "load_memory")
    builder.add_edge("load_memory", "build_memory_context")
    builder.add_edge("build_memory_context", "detect_loops")
    builder.add_edge("detect_loops", "choose_response_mode")
    builder.add_edge("choose_response_mode", "generate_reply")
    builder.add_edge("generate_reply", "summarize_turn")
    builder.add_edge("summarize_turn", "persist_summary")
    builder.add_edge("persist_summary", END)
    return builder.compile(checkpointer=_build_checkpointer())


def build_reply_graph():
    builder = StateGraph(NextMateState)
    builder.add_node("load_memory", load_memory_node)
    builder.add_node("build_memory_context", build_memory_context_node)
    builder.add_node("detect_loops", detect_loops_node)
    builder.add_node("choose_response_mode", choose_response_mode_node)
    builder.add_node("generate_reply", generate_reply_node)

    builder.add_edge(START, "load_memory")
    builder.add_edge("load_memory", "build_memory_context")
    builder.add_edge("build_memory_context", "detect_loops")
    builder.add_edge("detect_loops", "choose_response_mode")
    builder.add_edge("choose_response_mode", "generate_reply")
    builder.add_edge("generate_reply", END)
    return builder.compile(checkpointer=_build_checkpointer())


def build_summary_graph():
    builder = StateGraph(NextMateState)
    builder.add_node("summarize_turn", summarize_turn_node)
    builder.add_node("persist_summary", persist_summary_node)

    builder.add_edge(START, "summarize_turn")
    builder.add_edge("summarize_turn", "persist_summary")
    builder.add_edge("persist_summary", END)
    return builder.compile()


graph = build_graph()
reply_graph = build_reply_graph()
summary_graph = build_summary_graph()
