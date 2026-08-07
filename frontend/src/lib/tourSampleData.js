// Fixture data shown only during the guided tour, when a brand-new account
// has nothing real to point an arrow at yet. Every screen that uses these
// renders a small "sample" badge alongside them — see SampleBadge below —
// so nobody mistakes a fixture for their own history.

export const SAMPLE_TODAY_TRIGGERS = [
  { trigger: 'Work deadline', pct: 38 },
  { trigger: 'Sleep', pct: 24 },
  { trigger: 'Family call', pct: 19 },
  { trigger: 'Social plans', pct: 12 },
];

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

const SAMPLE_MOODS = ['overwhelmed', 'hopeful', 'calm', 'anxious', 'tired'];

const dayIso = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

// 30 days of light, hand-shaped variation — enough to make every chart look
// alive without pretending to be a real emotional history.
export const SAMPLE_TREND = Array.from({ length: 30 }, (_, i) => {
  const offset = 29 - i;
  const wave = Math.sin(i / 3.2);
  const count = 1 + Math.round(Math.abs(wave) * 2 + (i % 4 === 0 ? 1 : 0));
  const moods = {};
  SAMPLE_MOODS.forEach((m, mi) => {
    const share = Math.max(0, Math.round((Math.sin(i / 4 + mi) + 1) * 1.5));
    if (share > 0) moods[m] = share;
  });
  return {
    day: dayIso(offset),
    count,
    avg_intensity: +(4.5 + wave * 2.2).toFixed(1),
    moods,
  };
});

export const SAMPLE_MOOD_BREAKDOWN = [
  { mood: 'overwhelmed', pct: 32 },
  { mood: 'hopeful', pct: 24 },
  { mood: 'calm', pct: 18 },
  { mood: 'anxious', pct: 16 },
  { mood: 'tired', pct: 10 },
];

export const SAMPLE_INTENSITY_DISTRIBUTION = [2, 3, 5, 9, 14, 11, 7, 4, 2, 1].map((count, i) => ({
  intensity: i + 1,
  count,
}));

export const SAMPLE_TRIGGER_HEATMAP = [
  { trigger: 'work deadline', intensity: Array.from({ length: 30 }, (_, i) => Math.max(0, Math.sin(i / 3) * 0.6 + 0.3)) },
  { trigger: 'sleep', intensity: Array.from({ length: 30 }, (_, i) => Math.max(0, Math.cos(i / 4) * 0.5 + 0.2)) },
  { trigger: 'inbox overload', intensity: Array.from({ length: 30 }, (_, i) => Math.max(0, Math.sin(i / 5 + 1) * 0.4 + 0.15)) },
];

export const SAMPLE_KNOWLEDGE_GRAPH = {
  nodes: [
    { id: 't1', label: 'work deadline', type: 'trigger', size: 1, x: 0.62, y: 0.32, frequency: 5, degree: 3 },
    { id: 't2', label: 'inbox overload', type: 'trigger', size: 0.6, x: 0.78, y: 0.55, frequency: 3, degree: 2 },
    { id: 't3', label: 'sleep', type: 'trigger', size: 0.5, x: 0.4, y: 0.72, frequency: 3, degree: 2 },
    { id: 'b1', label: "not productive = falling behind", type: 'belief', size: 0.9, x: 0.45, y: 0.45, frequency: 5, degree: 3 },
    { id: 'b2', label: 'I should be doing more', type: 'belief', size: 0.5, x: 0.25, y: 0.3, frequency: 2, degree: 1 },
  ],
  edges: [
    { source: 't1', target: 'b1', strength: 0.9, is_loop: true },
    { source: 't2', target: 'b1', strength: 0.5, is_loop: false },
    { source: 't3', target: 'b1', strength: 0.4, is_loop: false },
    { source: 'b1', target: 'b2', strength: 0.6, is_loop: false },
  ],
};
