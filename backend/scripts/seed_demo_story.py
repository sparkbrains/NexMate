"""Seed ~3 months of journal history + 3 loops + chat conversations for a
single demo user.

Story arc: moving to Chandigarh, starting a job as an AI developer, building a
gym habit, a supportive relationship (bf), and a recurring anxiety about
whether to pursue a Master's degree.

Produces exactly 3 loops:
  1. "The New City Loneliness Loop"      -- negative, RESOLVED (last seen 36+ days ago)
  2. "The 'Left Behind' Master's Loop"    -- negative, ACTIVE   (last seen today)
  3. "Gym & bf Confidence Loop"        -- positive, ACTIVE   (last seen 2 days ago)

Also seeds 11 chat conversations (threads + thread_messages) so the
Conversation UI has history, and a matching journal_entries_v2 row per
chat turn (what the live agent writes via persist_summary_node) so
Dashboard/Insights aren't empty either.

Idempotent: re-running updates the same rows instead of duplicating them
(journal_logs via the unique (user_id, source_thread_id) index, loops via a
deterministic loop_id, threads via thread_id, thread_messages by deleting and
re-inserting per seeded thread, journal_entries_v2 via its dedupe index).

Usage:
    cd backend && python scripts/seed_demo_story.py [user_email]
"""

import sys
import os
import uuid
import json
from datetime import datetime, timedelta, timezone, date
from dotenv import load_dotenv

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(backend_dir, ".env"))
sys.path.append(backend_dir)

from psycopg.types.json import Jsonb
from apps.db import get_connection

DEFAULT_EMAIL = "ishmeet.k@sparkbrains.ai"
TODAY = datetime.now(timezone.utc).date()


def d(days_ago: int) -> date:
    return TODAY - timedelta(days=days_ago)


def dt(days_ago: int, hour: int = 19) -> datetime:
    return datetime.combine(d(days_ago), datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=hour)


# Each entry: (days_ago, mood_emoji, mood_label, body, translated, core_theme, belief, trigger, tag)
# tag groups entries that feed into a loop's matched_entries: "loneliness" | "future_stress" | "gym_relationship" | None
ENTRIES = [
    (91, "😰", "Anxious", "Landed in Chandigarh three days ago. The apartment is still full of boxes and I don't know anyone here. Video-called mom and just felt like crying afterward.",
     "The move still feels raw. Between the unpacked boxes and the quiet apartment, calling home tonight brought all the homesickness to the surface at once.",
     "Loneliness in a new city", "I don't belong here yet", "unpacking alone in a new apartment", "loneliness"),
    (88, "😕", "Uneasy", "Signed up for a gym near the new flat today. Walked in, felt completely out of place, everyone seemed to know the routine except me. Left after twenty minutes.",
     "Trying the new gym took real courage even if it didn't feel like a win today. Everyone else seemed to already belong there, and I left before I found my footing.",
     "Starting a gym habit", "", "", "gym"),
    (85, "🙂", "Okay", "First full week at the new role going deep on LLM pipelines. It's exciting but also A LOT — sometimes I wonder if I actually know what I'm doing.",
     "This first week as an AI developer has been thrilling and disorienting in equal measure. The work excites me even when it makes me doubt myself.",
     "Impostor syndrome as an AI developer", "", "", "work"),
    (82, "😊", "Grateful", "bf called every night this week just to make sure I'd eaten. It helps more than I say out loud. Still, Chandigarh feels like someone else's city, not mine yet.",
     "bf's nightly check-ins have been a quiet anchor this week, even while the city itself still feels borrowed rather than mine.",
     "Loneliness in a new city", "I don't belong here yet", "quiet evenings alone after work", "loneliness"),
    (78, "😟", "Worried", "Saw a friend's LinkedIn post about starting her Master's in Machine Learning abroad and spiraled a bit. Am I falling behind by staying in a job instead of studying further?",
     "A friend's Master's announcement sent me spiraling tonight, questioning a decision I'd otherwise felt settled about.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "seeing peers announce further education", "future_stress"),
    (75, "😐", "Neutral", "Went back to the gym. Still don't know anyone but I lasted a full session this time. Small win.",
     "A quieter session at the gym today, but a full one — proof that showing up again is its own kind of progress.",
     "Building a gym habit", "", "", "gym"),
    (72, "😔", "Low", "A month in Chandigarh now. Ordered food for one again. I keep telling myself it'll get easier but some nights it just doesn't feel like home.",
     "A full month here now, and tonight was one of the harder ones — the kind where I have to remind myself that settling in takes time.",
     "Loneliness in a new city", "I don't belong here yet", "eating dinner alone again", "loneliness"),
    (69, "🙂", "Good", "Shipped my first feature on the new agent pipeline today. My lead said the eval numbers looked solid. First time in weeks I felt actually good at this job.",
     "Shipping my first real feature today, and hearing the eval numbers held up, finally let me feel competent instead of just keeping up.",
     "Growing into the AI developer role", "", "", "work"),
    (66, "😟", "Anxious", "Spent the whole evening browsing Master's programs instead of resting. GRE, applications, cost — it's overwhelming to even think about on top of a full-time job.",
     "Another evening lost to browsing Master's programs instead of resting. The sheer weight of GRE prep, applications, and cost is hard to hold alongside a full-time job.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "browsing university websites late at night", "future_stress"),
    (63, "😄", "Happy", "bf surprised me by showing up at the gym with me today so I wouldn't have to go alone. We ended up laughing through the whole session instead of actually working out.",
     "bf showing up at the gym so I wouldn't go alone turned into one of the lightest, happiest sessions I've had since starting — more laughter than lifting.",
     "Feeling supported through bf and the gym", "I don't have to do hard things alone", "trying a new routine with bf's support", "gym_relationship"),
    (60, "🙂", "Better", "Grabbed coffee with a coworker after standup. First time since moving that Chandigarh felt a little less like a stopover and more like somewhere I'm actually living.",
     "Coffee with a coworker after standup today made Chandigarh feel, for the first time, like somewhere I'm actually living rather than just passing through.",
     "Loneliness in a new city", "I don't belong here yet", "connecting with a coworker outside of work", "loneliness"),
    (57, "😕", "Drained", "Debugged a gnarly RAG retrieval bug for six hours today. Felt dumb for most of it, then oddly proud when I finally found the root cause at 9pm.",
     "Six hours chasing a retrieval bug left me feeling slow for most of the day, until finding the root cause at 9pm turned that frustration into quiet pride.",
     "Impostor syndrome as an AI developer", "I should already know this by now", "getting stuck on a hard technical problem", "work"),
    (54, "💪", "Strong", "Three gym sessions this week without forcing myself. It's starting to feel like a habit instead of a chore.",
     "Three sessions this week, and none of them felt forced — the gym is starting to feel like a habit rather than an obligation.",
     "Gym habit taking hold", "", "", "gym"),
    (51, "😟", "Worried", "Told bf I feel behind for not doing a Master's yet. He just said 'behind whom?' and I didn't have a good answer. Still can't shake the feeling though.",
     "I told bf tonight that I feel behind for not pursuing a Master's yet. His question — 'behind whom?' — stuck with me, even though the worry hasn't actually let go.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "comparing my timeline to other people's", "future_stress"),
    (48, "🙂", "Settled", "Realized today I know the way to three different places in the city without maps now. Small thing, but it made me feel like I actually live here.",
     "Realizing I can navigate three parts of the city without a map felt small, but it was the first real proof that Chandigarh is becoming home.",
     "Loneliness in a new city", "I don't belong here yet", "navigating the city without help", "loneliness"),
    (45, "😊", "Happy", "bf and I have a standing Sunday gym date now. It's become one of my favorite parts of the week.",
     "Our standing Sunday gym date with bf has quietly become one of the best parts of my week.",
     "Feeling supported through bf and the gym", "I don't have to do hard things alone", "our regular Sunday gym routine", "gym_relationship"),
    (42, "😀", "Great", "Two months into this role and I actually look forward to opening my laptop most mornings. The AI dev work is hard but it's the good kind of hard.",
     "Two months in, and most mornings I genuinely look forward to opening my laptop. The work is hard, but it's the good kind of hard.",
     "Enjoying the AI developer role", "", "", "work"),
    (39, "😥", "Stressed", "Found out application deadlines for Fall intake are in a few months. Now I'm panicking about GRE prep, recommendation letters, and whether I even have time to do this properly.",
     "Learning that Fall intake deadlines are only months away set off a fresh wave of panic about GRE prep, recommendation letters, and whether I have time to do any of it properly.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "seeing an application deadline", "future_stress"),
    (36, "😌", "Content", "Hosted people at my place for the first time since moving — just bf and two coworkers over for dinner. My apartment finally feels like mine.",
     "Hosting bf and two coworkers for dinner tonight — the first time since moving — made this apartment finally feel like my own home rather than a temporary stop.",
     "Loneliness in a new city", "I don't belong here yet", "hosting people at home for the first time", "loneliness"),
    (33, "💪", "Happy", "Hit a new personal best on squats today. bf cheered louder than the trainer. I felt unstoppable for the rest of the day.",
     "A new personal best on squats today, with bf cheering louder than the trainer — I felt unstoppable for the rest of the day.",
     "Feeling supported through bf and the gym", "I don't have to do hard things alone", "hitting a new personal best with bf there", "gym_relationship"),
    (30, "🙂", "Proud", "Mentored a newer teammate on our eval pipeline today. Weird to think I was the lost one just two months ago.",
     "Mentoring a newer teammate on our eval pipeline today, it struck me how far I've come since being the lost one just two months ago.",
     "Growing into the AI developer role", "", "", "work"),
    (27, "😟", "Anxious", "Lay awake doing mental math on savings vs a Master's abroad. Even if I love my job now, what if this window to study closes and I regret it forever?",
     "Lay awake tonight doing mental math on savings versus a Master's abroad. Even loving my job doesn't quiet the fear that this window might close and leave me with regret.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "thinking about finances late at night", "future_stress"),
    (24, "😊", "Delighted", "bf made a playlist just for our gym sessions. Ridiculous and sweet. I laughed the entire warm-up.",
     "bf made a whole playlist just for our gym sessions — ridiculous and sweet in equal measure, and I laughed through the entire warm-up.",
     "Feeling supported through bf and the gym", "I don't have to do hard things alone", "a small, thoughtful gesture from bf", "gym_relationship"),
    (21, "🙂", "Good", "Presented my project to the wider team today and it actually went well. For a second I forgot to worry about grad school.",
     "Presenting my project to the wider team today went well enough that, for a moment, I actually forgot to worry about grad school.",
     "Growing into the AI developer role", "", "", "work"),
    (18, "😰", "Anxious", "A senior engineer casually mentioned his Master's helped him get promoted twice as fast. Spent the rest of the day questioning every decision that got me here.",
     "A senior engineer's offhand comment about his Master's speeding up his promotions sent me questioning every decision that brought me here, for the rest of the day.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "a colleague mentioning their own Master's degree", "future_stress"),
    (15, "💪", "Confident", "Four months of consistent gym now. bf says I stand differently — more sure of myself. I think he's right.",
     "Four months of consistency at the gym now, and bf says I stand differently — more sure of myself. I think he's right.",
     "Feeling supported through bf and the gym", "I don't have to do hard things alone", "noticing how consistency has changed me", "gym_relationship"),
    (12, "😀", "Proud", "Genuinely proud of the model eval dashboard I built this week. Being an AI developer still feels like the right call, most days.",
     "Genuinely proud of the eval dashboard I built this week — being an AI developer still feels like the right call, most days.",
     "Enjoying the AI developer role", "", "", "work"),
    (9, "😟", "Tired", "Drafted a pros/cons list for a Master's for the fourth time this year. Still no closer to deciding, just more tired of the question.",
     "Drafted a pros/cons list for a Master's for the fourth time this year. I'm no closer to an answer, just more tired of asking myself the question.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "trying to make a decision about further study", "future_stress"),
    (6, "😊", "Excited", "bf and I signed up for a couple's fitness challenge at the gym starting next month. Excited in a way I haven't felt in a while.",
     "Signing up with bf for next month's couple's fitness challenge left me excited in a way I haven't felt in a while.",
     "Feeling supported through bf and the gym", "I don't have to do hard things alone", "planning something new together with bf", "gym_relationship"),
    (4, "😥", "Scared", "Told bf I might just apply for a part-time Master's and see what happens instead of waiting for the 'perfect' time. He said that sounds like relief, not fear. Still scared though.",
     "Telling bf tonight that I might just apply for a part-time Master's instead of waiting for the 'perfect' time — he said it sounded like relief, not fear. I'm still scared, but something shifted.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "considering finally taking action on the Master's decision", "future_stress"),
    (2, "😊", "Grateful", "bf made me laugh so hard mid-set I almost dropped the bar. Grateful for how easy this feels now, compared to those first lonely weeks here.",
     "bf made me laugh so hard mid-set today I nearly dropped the bar. It's hard not to notice how easy this feels now, compared to those first lonely weeks here.",
     "Feeling supported through bf and the gym", "I don't have to do hard things alone", "how far the routine with bf has come", "gym_relationship"),
    (1, "🙂", "Content", "Quiet Monday, just deep work on the AI pipeline. Content, if a little tired. Still thinking about that Master's decision in the back of my mind.",
     "A quiet Monday of deep work on the pipeline left me content, if a little tired, with that Master's decision still humming quietly in the background.",
     "Enjoying the AI developer role", "", "", "work"),
    (0, "😟", "Anxious", "Woke up thinking about grad school applications again before I'd even had coffee. I know I need to just decide, but the fear of choosing wrong keeps looping.",
     "Woke up thinking about grad school applications again before I'd even had coffee. I know it's time to decide, but the fear of choosing wrong keeps pulling me back into the same loop.",
     "Anxiety about further study", "If I don't do a Master's now, I'll be left behind", "waking up already thinking about the decision", "future_stress"),
]

LOOP_DEFS = {
    "loneliness": dict(
        key="new-city-loneliness",
        loop_name="The New City Loneliness Loop",
        core_belief="I don't belong here yet",
        trigger="quiet evenings alone in an unfamiliar city",
        valence="negative",
        description=(
            "In your first weeks after moving to Chandigarh, you repeatedly noticed a heavy, "
            "isolated feeling on quiet evenings — eating alone, missing home, feeling like the "
            "city wasn't yours yet. This showed up across entries from mid-May through early July."
        ),
        suggestion=(
            "This one looks resolved. Your more recent entries show you navigating the city with "
            "ease and hosting people at your place. Worth revisiting only if that isolated feeling resurfaces."
        ),
        confidence_score=0.85,
        intensity_range=(6, 8),
    ),
    "future_stress": dict(
        key="masters-left-behind",
        loop_name="The 'Left Behind' Master's Anxiety Loop",
        core_belief="If I don't do a Master's now, I'll be left behind",
        trigger="seeing peers or colleagues mention further study",
        valence="negative",
        description=(
            "Roughly every couple of weeks since late May, seeing a peer's post, a colleague's "
            "promotion story, or an application deadline sends you into a spiral of comparison and "
            "second-guessing about whether to pursue a Master's degree — even on days you otherwise "
            "feel good about your career."
        ),
        suggestion=(
            "Still active and recurring. bf's reframe ('behind whom?') and your recent openness to "
            "a part-time program landed differently than earlier spirals — it may help to turn this into "
            "one concrete next step instead of another pros/cons list."
        ),
        confidence_score=0.88,
        intensity_range=(6, 9),
    ),
    "gym_relationship": dict(
        key="gym-bf-confidence",
        loop_name="Gym & bf Confidence Loop",
        core_belief="I don't have to do hard things alone",
        trigger="showing up to the gym with bf",
        valence="positive",
        description=(
            "Since mid-June, your gym sessions with bf have consistently shown up as a source of "
            "steady confidence and joy — from him showing up so you wouldn't go alone, to a shared "
            "Sunday routine, to signing up for a couple's fitness challenge together. This pattern "
            "reinforces itself rather than causing distress."
        ),
        suggestion=(
            "A positive loop worth protecting. It's become a reliable source of consistency and "
            "connection — notice what makes it work (support + routine) and consider applying the "
            "same pattern to the Master's decision."
        ),
        confidence_score=0.80,
        intensity_range=(5, 7),
    ),
}


# Each conversation: (days_ago, hour, key, title, tag, turns)
# tag ties the conversation to a LOOP_DEFS entry (or None for untagged work chats).
# Each turn: (user_msg, assistant_reply, core_theme, mood, belief, trigger, key_facts, next_focus, intensity)
CONVERSATIONS = [
    (89, 21, "loneliness-1", "Feeling lost in a new city", "loneliness", [
        ("I moved to Chandigarh three days ago for this new job and I don't know a single person here. "
         "Everything feels overwhelming and I keep tearing up for no reason.",
         "Moving somewhere with zero support network while starting a new job is genuinely one of the harder "
         "transitions there is — the tears aren't 'for no reason,' they're your system processing a lot of change "
         "at once. What's felt heaviest today — the practical stuff like unpacking, or the loneliness itself?",
         "Loneliness in a new city", "Anxious", "I don't belong here yet", "unpacking alone in a new apartment",
         ["Moved to Chandigarh 3 days ago", "Starting a new job"], "Find one small routine to anchor the week", 7),
        ("Mostly the loneliness. I called my mom tonight and just started crying after we hung up.",
         "That instinct to call home is healthy, not a setback — lean on it as long as you need to. Isolation like "
         "this tends to ease as routines and familiar faces build up around you; right now you're just at the very "
         "start of that curve.",
         "Loneliness in a new city", "Anxious", "I don't belong here yet", "calling home and feeling worse after",
         ["Called mom, cried after hanging up"], "Consider one small local routine next week", 7),
    ]),
    (70, 20, "loneliness-2", "A month in and still feels foreign", "loneliness", [
        ("It's been almost a month and Chandigarh still doesn't feel like mine. I ordered food for one again tonight.",
         "A month is still early days for a move like this, even though it might not feel that way from the "
         "inside. Ordering food for one isn't a failure marker — it's just where you are right now. Has anything, "
         "even small, started to feel a little familiar?",
         "Loneliness in a new city", "Low", "I don't belong here yet", "eating dinner alone again",
         ["One month since the move"], "Notice one small thing that felt familiar this week", 6),
        ("Honestly the gym, a little. And bf calls every night to check I've eaten, which helps more than I say out loud.",
         "Those two things — a place you keep returning to and someone checking in consistently — are exactly the "
         "kind of anchors that make a new place start to feel livable. Let yourself count them as real progress, "
         "even on the harder nights.",
         "Feeling supported through bf and the gym", "Grateful", "", "",
         ["bf calls nightly to check she's eaten", "Going to the gym regularly"],
         "Keep leaning on the nightly calls and gym routine", 4),
    ]),
    (47, 18, "loneliness-3", "Starting to know my way around", "loneliness", [
        ("Small win today — I realized I know the way to three different places in the city without needing maps anymore.",
         "That's a real milestone, not a small one — wayfinding without help is one of the clearest signs a place "
         "is shifting from 'foreign' to 'known.' How did it feel to notice that?",
         "Loneliness in a new city", "Settled", "I don't belong here yet", "navigating the city without help",
         ["Can now navigate 3 parts of the city without maps"], "Keep noticing small signs of feeling at home", 3),
        ("Actually kind of proud. It made me feel like I actually live here instead of just staying here.",
         "That distinction you just made — living here versus staying here — is worth holding onto. It sounds "
         "like the city is starting to become yours on your own timeline, not anyone else's.",
         "Loneliness in a new city", "Content", "", "",
         ["Feels ownership over the city now, not just presence"], "", 3),
    ]),
    (77, 22, "future-stress-1", "Spiraling over a friend's Master's post", "future_stress", [
        ("Saw a friend's LinkedIn post about starting her Master's abroad and now I'm spiraling. Am I falling "
         "behind by staying in my job instead of studying further?",
         "One post triggering a full spiral is a sign this touches something you haven't fully settled, not proof "
         "you're actually behind. What would 'falling behind' even look like to you, concretely?",
         "Anxiety about further study", "Worried", "If I don't do a Master's now, I'll be left behind",
         "seeing peers announce further education", ["Friend announced Master's in ML abroad"],
         "Get clear on what 'behind' actually means for her", 7),
        ("I don't know, honestly. I just felt this panic like the window is closing.",
         "That panic is worth noticing without immediately acting on it — decisions made from a closing-window "
         "feeling tend to serve the fear, not the actual goal. There's no evidence tonight that a real deadline "
         "changed, just that a comparison did.",
         "Anxiety about further study", "Anxious", "If I don't do a Master's now, I'll be left behind",
         "panic about a closing window", [], "Separate the panic from any real deadline", 7),
    ]),
    (38, 23, "future-stress-2", "Panicking about application deadlines", "future_stress", [
        ("Just found out Fall intake deadlines are only a few months away. Now I'm panicking about GRE prep, "
         "recommendation letters, all of it on top of a full-time job.",
         "That's a lot to take in at once, and the panic makes sense — but a deadline existing doesn't obligate "
         "you to apply to it. Is this the first time you're seriously considering acting on the Master's idea, or "
         "has that been building for a while?",
         "Anxiety about further study", "Stressed", "If I don't do a Master's now, I'll be left behind",
         "seeing an application deadline", ["Fall intake deadlines are in a few months"],
         "Decide if this deadline is even the right one to aim for", 8),
        ("It's been building for months honestly. I just don't know if I even have the time to do it properly.",
         "That's useful to name — this isn't a sudden decision, it's a long-simmering one. Given that, it might "
         "help to separate 'do I want this' from 'can I do it by this specific deadline,' since those are two "
         "different questions.",
         "Anxiety about further study", "Worried", "If I don't do a Master's now, I'll be left behind",
         "realizing the decision has been building for months", [],
         "Separate wanting the degree from this specific deadline", 7),
    ]),
    (5, 22, "future-stress-3", "Considering a part-time Master's", "future_stress", [
        ("I told bf I might just apply for a part-time Master's and see what happens instead of waiting for the "
         "'perfect' time. He said that sounds like relief, not fear.",
         "That's worth sitting with — the people closest to you often hear the emotional register under a "
         "decision before you can name it yourself. Does 'relief' actually match how it felt to say it out loud?",
         "Anxiety about further study", "Scared", "If I don't do a Master's now, I'll be left behind",
         "considering finally taking action on the Master's decision",
         ["Considering a part-time Master's program", "bf reframed the decision as relief, not fear"],
         "Notice whether relief or fear is more present next time this comes up", 6),
        ("A little, yeah. Still scared though, but it felt different than the usual spiral.",
         "Different is meaningful here — most of your past entries on this describe a spiral, and this one "
         "describes a decision, even a scared one. That's a shift worth marking.",
         "Anxiety about further study", "Hopeful", "", "",
         ["This felt like a decision rather than a spiral"], "Take one concrete step toward the part-time program", 5),
    ]),
    (63, 20, "gym-1", "bf showed up at the gym with me", "gym_relationship", [
        ("bf surprised me by showing up at the gym with me today so I wouldn't have to go alone. We ended up "
         "laughing through the whole session instead of actually working out.",
         "That's a lovely thing to have — someone showing up specifically so you don't have to face something "
         "alone. How did it change the way the session felt compared to going by yourself?",
         "Feeling supported through bf and the gym", "Happy", "I don't have to do hard things alone",
         "trying a new routine with bf's support", ["bf joined her at the gym unprompted"],
         "Notice how support changes how hard things feel", 3),
        ("Way lighter, honestly. It didn't feel like a chore at all, more like something fun we were doing together.",
         "That's worth holding onto as a template — when something hard is shared, it can stop feeling like a "
         "chore altogether. Might be worth applying that same idea elsewhere in your life.",
         "Feeling supported through bf and the gym", "Happy", "I don't have to do hard things alone", "",
         [], "Apply the 'share the hard thing' pattern elsewhere", 2),
    ]),
    (44, 11, "gym-2", "Our Sunday gym ritual", "gym_relationship", [
        ("bf and I have a standing Sunday gym date now. It's become one of my favorite parts of the week.",
         "A standing ritual like that says a lot — it's not just about the workout anymore, it's become something "
         "you both protect time for. What makes Sundays specifically feel different from other sessions?",
         "Feeling supported through bf and the gym", "Happy", "I don't have to do hard things alone",
         "our regular Sunday gym routine", ["Standing Sunday gym date with bf"],
         "Keep protecting the Sunday ritual", 2),
        ("No pressure, I think. It's not about hitting a PR, it's just our time.",
         "That's exactly what makes rituals sustainable — when the point becomes the connection rather than the "
         "performance, it's much easier to keep showing up.",
         "Feeling supported through bf and the gym", "Content", "", "", [], "", 2),
    ]),
    (7, 19, "gym-3", "Signing up for a couple's fitness challenge", "gym_relationship", [
        ("bf and I signed up for a couple's fitness challenge at the gym starting next month. Excited in a way I "
         "haven't felt in a while.",
         "That excitement is worth noticing — it's a different register than the anxious energy that's shown up "
         "in a lot of your other entries lately. What is it about this specific thing that has you feeling that way?",
         "Feeling supported through bf and the gym", "Excited", "I don't have to do hard things alone",
         "planning something new together with bf", ["Signed up for a couple's fitness challenge starting next month"],
         "Carry this excited energy into other decisions", 2),
        ("I think it's that it's forward-looking and shared, not something I have to figure out by myself.",
         "That combination — shared and forward-looking — seems to be a pattern for what actually energizes you, "
         "as opposed to what drains you. Worth keeping in mind next time a decision feels heavy and solitary.",
         "Feeling supported through bf and the gym", "Excited", "", "",
         ["Pattern noticed: shared + forward-looking activities feel energizing"],
         "Look for ways to make the Master's decision feel shared too", 2),
    ]),
    (84, 20, "work-1", "First week nerves at the new job", None, [
        ("First full week going deep on LLM pipelines at the new job. It's exciting but also a lot — sometimes I "
         "wonder if I actually know what I'm doing.",
         "Feeling in-over-your-head in week one of a genuinely technical new role is close to universal, not a "
         "sign you're unqualified. What's one thing this week that you actually did handle well, even if it "
         "didn't feel like enough at the time?",
         "Impostor syndrome as an AI developer", "Okay", "", "",
         ["First week at new AI developer role", "Working on LLM pipelines"],
         "Notice one thing handled well each week", 5),
        ("I guess I did get one eval script working end to end without much help.",
         "That counts, and it's worth writing down — 'end to end without much help' in week one of a new stack is "
         "a real data point, even if it doesn't feel dramatic yet.",
         "Growing into the AI developer role", "Okay", "", "",
         ["Got an eval script working end-to-end unaided in week one"], "", 4),
    ]),
    (20, 17, "work-2", "Presenting my project went well", None, [
        ("Presented my project to the wider team today and it actually went well. For a second I forgot to worry "
         "about grad school.",
         "That's worth sitting with for a second — a moment where the work itself was enough to hold your full "
         "attention. What do you think made this presentation land differently than you expected?",
         "Growing into the AI developer role", "Good", "", "",
         ["Presented project to the wider team, went well"], "", 3),
        ("I think I actually knew the material cold this time, so I wasn't just performing confidence.",
         "That's a meaningful shift from a couple months ago, when you described feeling like you were keeping up "
         "rather than actually knowing things. This sounds like the impostor-syndrome loop loosening its grip, "
         "at least for now.",
         "Enjoying the AI developer role", "Proud", "", "",
         ["Felt genuine competence rather than performed confidence"], "", 2),
    ]),
]


def seed_conversations(cur, user_id: int) -> None:
    for days_ago, hour, key, title, tag, turns in CONVERSATIONS:
        thread_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"seed-demo-story-thread:{user_id}:{key}"))
        started_at = dt(days_ago, hour)
        loop_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"seed-demo-story:{user_id}:{LOOP_DEFS[tag]['key']}")) if tag else None

        cur.execute(
            """
            INSERT INTO threads (thread_id, user_id, title, created_at, updated_at, loop_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (thread_id) DO UPDATE SET
                title = EXCLUDED.title,
                updated_at = EXCLUDED.updated_at,
                loop_id = EXCLUDED.loop_id
            """,
            (thread_id, user_id, title, started_at, started_at + timedelta(minutes=6 * len(turns)), loop_id),
        )

        # thread_messages has no natural unique key -- clear this seeded
        # thread's messages before re-inserting so re-runs don't duplicate.
        cur.execute("DELETE FROM thread_messages WHERE thread_id = %s", (thread_id,))

        offset = 0
        for user_msg, assistant_reply, core_theme, mood, belief, trigger, key_facts, next_focus, intensity in turns:
            user_at = started_at + timedelta(minutes=offset)
            assistant_at = started_at + timedelta(minutes=offset + 1)
            offset += 6

            cur.execute(
                "INSERT INTO thread_messages (user_id, thread_id, role, content, created_at) VALUES (%s, %s, %s, %s, %s)",
                (user_id, thread_id, "user", user_msg, user_at),
            )
            cur.execute(
                "INSERT INTO thread_messages (user_id, thread_id, role, content, created_at) VALUES (%s, %s, %s, %s, %s)",
                (user_id, thread_id, "assistant", assistant_reply, assistant_at),
            )

            core_beliefs = [belief] if belief else []
            triggers = [trigger] if trigger else []
            raw_summary = {
                "core_theme": core_theme, "mood": mood, "core_beliefs": core_beliefs,
                "triggers": triggers, "key_facts": key_facts, "next_focus": next_focus, "intensity": intensity,
            }
            cur.execute(
                """
                INSERT INTO journal_entries_v2 (
                    user_id, thread_id, user_input, assistant_reply, core_theme, mood,
                    core_beliefs, triggers, key_facts, next_focus, intensity, raw_summary, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, thread_id, created_at, core_theme) DO UPDATE SET
                    user_input = EXCLUDED.user_input,
                    assistant_reply = EXCLUDED.assistant_reply,
                    mood = EXCLUDED.mood,
                    core_beliefs = EXCLUDED.core_beliefs,
                    triggers = EXCLUDED.triggers,
                    key_facts = EXCLUDED.key_facts,
                    next_focus = EXCLUDED.next_focus,
                    intensity = EXCLUDED.intensity,
                    raw_summary = EXCLUDED.raw_summary
                """,
                (
                    user_id, thread_id, user_msg, assistant_reply, core_theme, mood,
                    Jsonb(core_beliefs), Jsonb(triggers), Jsonb(key_facts), next_focus,
                    intensity, Jsonb(raw_summary), assistant_at,
                ),
            )

    print(f"  Seeded {len(CONVERSATIONS)} conversation threads "
          f"({sum(len(c[5]) for c in CONVERSATIONS)} turns) with matching journal_entries_v2 rows.")


def seed(email: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            if not row:
                print(f"No user found with email {email}")
                return
            user_id = row["id"]
            print(f"Seeding 3-month story for {email} (user_id={user_id})...")

            # The Journal UI filters entries by book_id (streak calculation
            # doesn't), so entries must be attached to a real book or they're
            # invisible in the Journal page despite counting toward the streak.
            cur.execute(
                """
                INSERT INTO journal_books (user_id, name, color, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, name) DO UPDATE SET color = EXCLUDED.color
                RETURNING id
                """,
                (user_id, "Daily journal", "var(--accent)", datetime.now(timezone.utc)),
            )
            book_id = cur.fetchone()["id"]

            matched_by_tag: dict[str, list[dict]] = {"loneliness": [], "future_stress": [], "gym_relationship": []}

            for idx, (days_ago, emoji, label, body, translated, theme, belief, trigger, tag) in enumerate(ENTRIES):
                entry_date = d(days_ago)
                core_beliefs = [belief] if belief else []
                triggers = [trigger] if trigger else []
                source_thread_id = f"seed-story-{idx:02d}"

                cur.execute(
                    """
                    INSERT INTO journal_logs
                        (user_id, book_id, entry_date, mood_emoji, mood_label, body, translated,
                         core_theme, core_beliefs, triggers, source_thread_id, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, source_thread_id) WHERE source_thread_id IS NOT NULL
                    DO UPDATE SET
                        book_id = EXCLUDED.book_id,
                        entry_date = EXCLUDED.entry_date,
                        mood_emoji = EXCLUDED.mood_emoji,
                        mood_label = EXCLUDED.mood_label,
                        body = EXCLUDED.body,
                        translated = EXCLUDED.translated,
                        core_theme = EXCLUDED.core_theme,
                        core_beliefs = EXCLUDED.core_beliefs,
                        triggers = EXCLUDED.triggers,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        user_id, book_id, entry_date, emoji, label, body, translated,
                        theme, Jsonb(core_beliefs), Jsonb(triggers), source_thread_id,
                        dt(days_ago), dt(days_ago),
                    ),
                )

                if tag in matched_by_tag:
                    lo, hi = LOOP_DEFS[tag]["intensity_range"]
                    intensity = lo + (idx % (hi - lo + 1))
                    matched_by_tag[tag].append({
                        "date": entry_date.isoformat(),
                        "summary": theme,
                        "mood": label,
                        "thread_id": "journal",
                        "intensity": intensity,
                    })

            print(f"  Seeded {len(ENTRIES)} journal_logs entries.")

            for tag, definition in LOOP_DEFS.items():
                matches = matched_by_tag[tag]
                dates = [dt((TODAY - date.fromisoformat(m["date"])).days) for m in matches]
                first_detected_at = min(dates)
                last_detected_at = max(dates)
                detection_dates = [dd.isoformat() for dd in dates]

                loop_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"seed-demo-story:{user_id}:{definition['key']}"))

                cur.execute(
                    """
                    INSERT INTO loops (
                        loop_id, thread_id, user_id, loop_name, core_belief, trigger,
                        valence, first_detected_at, last_detected_at, detection_count,
                        detection_dates, matched_entries, description, suggestion,
                        confidence_score, validation_metadata
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (loop_id) DO UPDATE SET
                        loop_name = EXCLUDED.loop_name,
                        core_belief = EXCLUDED.core_belief,
                        trigger = EXCLUDED.trigger,
                        valence = EXCLUDED.valence,
                        first_detected_at = EXCLUDED.first_detected_at,
                        last_detected_at = EXCLUDED.last_detected_at,
                        detection_count = EXCLUDED.detection_count,
                        detection_dates = EXCLUDED.detection_dates,
                        matched_entries = EXCLUDED.matched_entries,
                        description = EXCLUDED.description,
                        suggestion = EXCLUDED.suggestion,
                        confidence_score = EXCLUDED.confidence_score,
                        validation_metadata = EXCLUDED.validation_metadata
                    """,
                    (
                        loop_id, "journal", user_id, definition["loop_name"], definition["core_belief"],
                        definition["trigger"], definition["valence"], first_detected_at, last_detected_at,
                        len(matches), Jsonb(detection_dates), Jsonb(matches), definition["description"],
                        definition["suggestion"], definition["confidence_score"], Jsonb({}),
                    ),
                )
                state = "resolved" if (datetime.now(timezone.utc) - last_detected_at).days > 30 else "active"
                print(f"  Loop '{definition['loop_name']}' ({definition['valence']}, {state}) "
                      f"-- {len(matches)} matched entries, last seen {last_detected_at.date()}.")

            seed_conversations(cur, user_id)

        conn.commit()
    print("Done.")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EMAIL
    seed(email)
