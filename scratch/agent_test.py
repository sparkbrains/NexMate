import asyncio
from nextmate_agent.agent import get_graph

def run_test():
    async def inner():
        graph = get_graph()
        config = {"configurable": {"user_id": 1, "thread_id": "test"}}
        inputs = {"user_input": "I feel happy today", "chat_history": []}
        result = await graph.ainvoke(inputs, config)
        print("Result:", result)
    await inner()

asyncio.run(run_test())
