"""One-off script that (re)generates data/prompt_pack.xlsx from the prompt
list below. Run with: python scripts/generate_prompt_pack_xlsx.py

The app reads the generated .xlsx at runtime (see
apps/api/services/prompt_pack_service.py) -- this script is only how the
sheet gets authored/updated, not something the app imports.
"""

from pathlib import Path

from openpyxl import Workbook

PROMPTS = [
    # values
    ("values_uncompromising", "values", "What's one value you'd never compromise on, even under pressure?"),
    ("values_proudest", "values", "What's something you did recently that you're quietly proud of?"),
    ("values_definition_success", "values", "How do you personally define success, separate from what others expect?"),
    ("values_non_negotiable_time", "values", "What's something you always make time for, no matter how busy you are?"),
    ("values_admire", "values", "Whose values do you admire most, and what about them stands out?"),

    # coping
    ("coping_first_instinct", "coping", "When things get overwhelming, what's your first instinct — push through, pull back, or shut down?"),
    ("coping_ask_for_help", "coping", "How easy is it for you to ask for help when you need it?"),
    ("coping_criticism", "coping", "How do you usually react when someone criticizes you?"),
    ("coping_stress_signal", "coping", "What's usually the first sign that you're getting stressed, before you even notice it consciously?"),
    ("coping_recovery", "coping", "What helps you recover fastest after a genuinely hard day?"),

    # relationships
    ("relationships_recharge", "relationships", "Do you recharge more by being around people, or by being alone?"),
    ("relationships_trust", "relationships", "What makes you trust someone — is it consistency, honesty, or something else?"),
    ("relationships_conflict", "relationships", "Do you tend to confront conflict directly, or let it settle on its own?"),
    ("relationships_boundaries", "relationships", "How comfortable are you setting boundaries with people close to you?"),
    ("relationships_show_love", "relationships", "How do you prefer to show people you care about them?"),

    # growth
    ("growth_hardest_lesson", "growth", "What's a lesson you learned the hard way that you're grateful for now?"),
    ("growth_avoiding", "growth", "Is there something you've been avoiding lately? What's stopping you?"),
    ("growth_who_you_were", "growth", "What's one way you're different from who you were a year ago?"),
    ("growth_next_version", "growth", "Who do you want to become a year from now?"),

    # gratitude
    ("gratitude_today", "gratitude", "What's one small thing today that you're genuinely grateful for?"),
    ("gratitude_person", "gratitude", "Who is someone you don't thank enough?"),
    ("gratitude_hard_time", "gratitude", "What's something difficult that, in hindsight, you're grateful happened?"),

    # identity
    ("identity_describe_self", "identity", "How would you describe yourself to a stranger, in three words?"),
    ("identity_role_vs_self", "identity", "Does your job or role feel like it defines who you are, or is it separate?"),
    ("identity_change", "identity", "What's one part of your identity that's changed the most over the years?"),

    # fear
    ("fear_biggest", "fear", "What's a fear that quietly shapes more of your decisions than you'd like to admit?"),
    ("fear_facing", "fear", "When did you last do something despite being afraid of it?"),
    ("fear_avoidance", "fear", "Is there a conversation you've been putting off because it scares you?"),

    # purpose
    ("purpose_energized", "purpose", "What kind of work or activity makes you lose track of time?"),
    ("purpose_legacy", "purpose", "What do you want people to remember about how you made them feel?"),
    ("purpose_meaning", "purpose", "What gives your day-to-day life meaning right now?"),

    # habits
    ("habits_proud", "habits", "What's a habit you've built that you're proud of?"),
    ("habits_breaking", "habits", "Is there a habit you're trying to break? What makes it hard?"),
    ("habits_morning", "habits", "What does your ideal morning look like?"),

    # communication
    ("communication_style", "communication", "Are you more direct or more diplomatic when something's bothering you?"),
    ("communication_listening", "communication", "Do you think of yourself as a better talker or a better listener?"),
    ("communication_hard_truth", "communication", "When was the last time you told someone a hard truth, and how did it go?"),

    # self_compassion
    ("self_compassion_inner_voice", "self_compassion", "Is your inner voice more like a coach or a critic?"),
    ("self_compassion_forgive", "self_compassion", "What's something about yourself you're still learning to forgive?"),
    ("self_compassion_rest", "self_compassion", "How do you feel about resting without being 'productive'?"),
]


def main() -> None:
    out_path = Path(__file__).resolve().parents[1] / "data" / "prompt_pack.xlsx"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "Prompts"
    ws.append(["id", "category", "text"])
    for row in PROMPTS:
        ws.append(list(row))

    wb.save(out_path)
    print(f"Wrote {len(PROMPTS)} prompts to {out_path}")


if __name__ == "__main__":
    main()