from nextmate_agent.agent import graph


def main() -> None:
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

        config = {"configurable": {"thread_id": thread_id}}
        payload = graph.invoke({"user_input": user_input}, config=config)
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
