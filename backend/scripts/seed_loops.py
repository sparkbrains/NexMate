import sys
import os
import uuid
import json
from datetime import datetime, timedelta, timezone

# Add parent directory to path so we can import apps
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from apps.db import get_connection

def _utc_now():
    return datetime.now(timezone.utc)

def seed_loops_for_user(email: str):
    email = email.lower().strip()
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            if not row:
                print(f"User {email} not found. Cannot seed loops.")
                return
            user_id = row['id']
            
            # Create a thread
            thread_id = f"thread_seed_{uuid.uuid4().hex[:8]}"
            cur.execute("""
                INSERT INTO threads (thread_id, user_id, title, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (thread_id, user_id, "Seeded Reflection", _utc_now(), _utc_now()))
            
            # Create journal entries
            print("Seeding journal entries...")
            entries = [
                {
                    "thread_id": thread_id,
                    "user_input": "I feel really stressed about my upcoming exams. I can't sleep.",
                    "assistant_reply": "It's normal to feel stressed. Have you tried breaking down your study material?",
                    "core_theme": "Academic stress",
                    "mood": "Anxious",
                    "core_beliefs": ["I must be perfect", "Failure is unacceptable"],
                    "triggers": ["upcoming exam", "studying late"],
                    "key_facts": ["Exams next week"],
                    "next_focus": "Study schedule",
                    "intensity": 8,
                    "created_at": _utc_now() - timedelta(days=2)
                },
                {
                    "thread_id": thread_id,
                    "user_input": "My neighbor was being loud again, I'm so irritated.",
                    "assistant_reply": "That sounds frustrating, especially when you need rest.",
                    "core_theme": "Environmental disturbance",
                    "mood": "Irritated",
                    "core_beliefs": ["People should be considerate"],
                    "triggers": ["neighbor's behavior"],
                    "key_facts": ["Loud neighbor"],
                    "next_focus": "Talk to neighbor",
                    "intensity": 6,
                    "created_at": _utc_now() - timedelta(days=1)
                }
            ]
            
            for entry in entries:
                cur.execute("""
                    INSERT INTO journal_entries_v2 
                    (user_id, thread_id, user_input, assistant_reply, core_theme, mood, core_beliefs, triggers, key_facts, next_focus, intensity, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    user_id, entry["thread_id"], entry["user_input"], entry["assistant_reply"],
                    entry["core_theme"], entry["mood"], json.dumps(entry["core_beliefs"]),
                    json.dumps(entry["triggers"]), json.dumps(entry["key_facts"]),
                    entry["next_focus"], entry["intensity"], entry["created_at"]
                ))
            
            # Create loops
            print("Seeding loops...")
            loop_id = uuid.uuid4()
            cur.execute("""
                INSERT INTO loops 
                (loop_id, thread_id, user_id, loop_name, core_belief, trigger, valence, first_detected_at, last_detected_at, detection_count, detection_dates, matched_entries, description, suggestion, confidence_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                loop_id, thread_id, user_id, "Academic Pressure Loop", "I must be perfect", "upcoming exam", "negative",
                _utc_now() - timedelta(days=2), _utc_now(), 2, json.dumps([(_utc_now() - timedelta(days=2)).isoformat(), _utc_now().isoformat()]),
                json.dumps([]), "A recurring pattern of feeling anxious and overwhelmed by academic expectations.",
                "Try to set realistic daily goals rather than focusing on the final outcome.", 0.85
            ))
            
            conn.commit()
            print("Successfully seeded journal entries and loops.")

if __name__ == "__main__":
    seed_loops_for_user("demo@nextmate.local")
