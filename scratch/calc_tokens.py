import tiktoken
import sys
import os

# Add the backend dir to sys.path so we can import nextmate_agent
sys.path.insert(0, r"d:\ISH_code\nex_03\backend")

from nextmate_agent.utils.prompts import (
    CHAT_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    LOOP_DETECTION_SYSTEM_PROMPT,
    EXPLICIT_ADVICE_DETECTION_SYSTEM_PROMPT,
    LOOP_COMPARISON_SYSTEM_PROMPT,
    LOOP_RESURFACE_CHECK_SYSTEM_PROMPT,
)

from nextmate_agent.utils.nodes import MODE_SELECTION_SYSTEM_PROMPT

def count_tokens(text: str) -> int:
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

prompts = {
    "CHAT_SYSTEM_PROMPT": CHAT_SYSTEM_PROMPT,
    "SUMMARY_SYSTEM_PROMPT": SUMMARY_SYSTEM_PROMPT,
    "LOOP_DETECTION_SYSTEM_PROMPT": LOOP_DETECTION_SYSTEM_PROMPT,
    "EXPLICIT_ADVICE_DETECTION_SYSTEM_PROMPT": EXPLICIT_ADVICE_DETECTION_SYSTEM_PROMPT,
    "LOOP_COMPARISON_SYSTEM_PROMPT": LOOP_COMPARISON_SYSTEM_PROMPT,
    "LOOP_RESURFACE_CHECK_SYSTEM_PROMPT": LOOP_RESURFACE_CHECK_SYSTEM_PROMPT,
    "MODE_SELECTION_SYSTEM_PROMPT": MODE_SELECTION_SYSTEM_PROMPT,
}

print("=== Token Counts for System Prompts ===")
for name, prompt in prompts.items():
    print(f"{name}: {count_tokens(prompt)}")

