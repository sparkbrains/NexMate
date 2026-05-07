from apps.env_loader import load_runtime_env
from apps.logging_config import configure_logging
import sys

def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    load_runtime_env()
    configure_logging()
    from nextmate_agent.agent import checkpoint_thread_id, get_graph

    thread_id = input("Thread ID (default: demo-thread): ").strip() or "demo-thread"
    print("NextMate CLI (type 'exit' to quit)")
    print("Use '/thread <id>' to switch thread memory.")

    while True:
        user_input = input("You: ").strip()
        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit"}:
            break
        if user_input.startswith("/thread "):
            next_thread_id = user_input.replace("/thread ", "", 1).strip()
            if next_thread_id:
                thread_id = next_thread_id
                print(f"[system] switched to thread: {thread_id}")
            continue

        config = {"configurable": {"thread_id": checkpoint_thread_id(-1, thread_id), "user_id": -1}}
        payload = get_graph().invoke({"user_input": user_input, "thread_id": thread_id}, config=config)
        reply = payload.get("assistant_reply", "").strip()
        summary = payload.get("turn_summary", {})

        print(f"NextMate: {reply}")
        if summary:
            print(
                f"[memory] thread={thread_id} | mood={summary.get('mood', 'unknown')} "
                f"| {summary.get('summary', '')}"
            )


if __name__ == "__main__":
    main()
