import tiktoken
import sys

sys.path.insert(0, r"d:\ISH_code\nex_03\backend")

from nextmate_agent.utils.prompts import (
    build_explicit_advice_detection_prompt,
    build_loop_resurface_check_prompt,
    build_mode_selection_prompt,
    build_loop_detection_prompt,
    build_loop_comparison_prompt,
    build_chat_user_prompt,
    build_summary_user_prompt
)

def count_tokens(text: str) -> int:
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

prompts_static = {
    "build_explicit_advice_detection_prompt": build_explicit_advice_detection_prompt(""),
    "build_loop_resurface_check_prompt": build_loop_resurface_check_prompt("", []),
    "build_mode_selection_prompt": build_mode_selection_prompt(
        user_input="", memory_context="", history_context="", detected_loops="",
        stored_loops=[], active_loop=None, allowed_modes=[]
    ),
    "build_loop_detection_prompt": build_loop_detection_prompt("", [], []),
    "build_loop_comparison_prompt": build_loop_comparison_prompt({}, []),
    "build_chat_user_prompt": build_chat_user_prompt(
        user_input="", memory_context="", history_context="", detected_loops="",
        stored_loops=[], response_mode="", active_loop=None
    ),
    "build_summary_user_prompt": build_summary_user_prompt("", "")
}

print("=== Static Overhead for User Prompts ===")
for name, prompt in prompts_static.items():
    print(f"{name}: {count_tokens(prompt)}")
