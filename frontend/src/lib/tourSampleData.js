// Placeholder loop shown behind the blur overlay whenever an account has no
// real loops yet — both before the guided tour (ordinary empty state) and
// during it (so the Loops spotlight steps have something loop-shaped, if
// blurred, to point an arrow at). Real loops always take priority once any
// exist.

export const SAMPLE_LOOP = {
  loop_id: '__sample__',
  name: "If I'm not productive, I'm falling behind",
  core_belief: "If I'm not productive, I'm falling behind",
  description: 'Shows up whenever a deadline gets close — a spiral from mild urgency into "I should be doing more."',
  state: 'active',
  strength: 0.72,
  occurrences: 5,
  avg_intensity: 6.8,
  span_days: 18,
  first_detected_at: new Date(Date.now() - 18 * 86400000).toISOString(),
  last_detected_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  thread_count: 3,
  triggers: ['work deadline', 'inbox overload'],
  trigger: 'work deadline',
  valence: 'anxious',
  dominant_mood: 'overwhelmed',
  co_moods: [{ mood: 'tired' }, { mood: 'irritable' }],
  co_triggers: [{ trigger: 'sleep' }, { trigger: 'inbox overload' }],
  suggestion: 'Try naming one "good enough" thing to ship today instead of the perfect one.',
  entries: [
    { date: new Date(Date.now() - 1 * 86400000).toISOString(), summary: 'Stayed late again, still felt behind after.', mood: 'overwhelmed' },
    { date: new Date(Date.now() - 6 * 86400000).toISOString(), summary: 'Skipped lunch to finish a deck nobody asked to see early.', mood: 'anxious' },
    { date: new Date(Date.now() - 11 * 86400000).toISOString(), summary: 'Couldn’t enjoy the weekend, kept thinking about Monday.', mood: 'tired' },
    { date: new Date(Date.now() - 14 * 86400000).toISOString(), summary: 'Said yes to another project to "stay ahead."', mood: 'anxious' },
    { date: new Date(Date.now() - 18 * 86400000).toISOString(), summary: 'First noticed the pattern after a rough review.', mood: 'overwhelmed' },
  ],
};

export const SAMPLE_LOOPS_LIST = [
  { loop_id: SAMPLE_LOOP.loop_id, strength: SAMPLE_LOOP.strength, state: 'active', core_belief: SAMPLE_LOOP.core_belief, name: SAMPLE_LOOP.name, occurrences: SAMPLE_LOOP.occurrences, trigger: SAMPLE_LOOP.trigger },
];

export const SAMPLE_LOOP_COUNTS = { total: 1, active: 1, resolved: 0 };