import sys
import os
import uuid
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Load .env from the backend root
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(backend_dir, '.env'))
sys.path.append(backend_dir)

from apps.db import get_connection

def _utc_now():
    return datetime.now(timezone.utc)

def seed_loops_for_all_users():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email FROM users")
            users = cur.fetchall()
            if not users:
                print("No users found in database.")
                return
            
            for row in users:
                user_id = row['id']
                email = row['email']
                print(f"Seeding history for {email} (ID: {user_id})...")
                
                # Create journal entries
                entries_data = [
                    {
                        "user_input": "I have so much work and exams coming up. I feel completely overwhelmed and can't sleep.",
                        "assistant_reply": "It sounds like you're carrying a very heavy load right now. Let's break down what's most urgent.",
                        "core_theme": "Work and academic stress",
                        "mood": "Anxious",
                        "core_beliefs": ["I have to do everything perfectly", "If I fail, I'm worthless"],
                        "triggers": ["upcoming deadlines", "thinking about workload"],
                        "key_facts": ["Heavy workload", "Exams approaching"],
                        "next_focus": "Prioritization",
                        "intensity": 8,
                        "created_at": _utc_now() - timedelta(days=2)
                    },
                    {
                        "user_input": "I spent all day working but still feel like I'm behind. The pressure is too much.",
                        "assistant_reply": "That feeling of never doing enough can be exhausting. What would it look like to acknowledge the hard work you did today?",
                        "core_theme": "Work pressure",
                        "mood": "Stressed",
                        "core_beliefs": ["I must always be productive"],
                        "triggers": ["end of workday", "pending tasks"],
                        "key_facts": ["Worked all day", "Feeling behind"],
                        "next_focus": "Self-compassion",
                        "intensity": 7,
                        "created_at": _utc_now() - timedelta(days=1)
                    }
                ]
                
                seeded_threads = []
                for entry in entries_data:
                    tid = str(uuid.uuid4())
                    seeded_threads.append(tid)
                    
                    # Create thread
                    cur.execute("""
                        INSERT INTO threads (thread_id, user_id, title, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (tid, user_id, "Seeded Reflection", entry["created_at"], entry["created_at"]))
                    
                    # Create thread summary so it appears in cross-thread memory
                    cur.execute("""
                        INSERT INTO thread_summaries (thread_id, user_id, summary_text, token_estimate, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (tid, user_id, f"User felt {entry['mood']} regarding {entry['core_theme']}.", 30, entry["created_at"]))
                    
                    entry["thread_id"] = tid
                
                for entry in entries_data:
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
            
            conn.commit()
            print("Successfully seeded distinct threads and journal history for all users.")

if __name__ == "__main__":
    seed_loops_for_all_users()
