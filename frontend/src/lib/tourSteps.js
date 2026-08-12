// Content for the guided first-run tour. Kept separate from the engine
// (TourSpotlight) and the state machine (useOnboardingTour) so copy can be
// tweaked without touching either.

// Order the sidebar nudges walk the user through, after Home (where they
// already land post-signup).
export const TOUR_FLOW = ['today', 'loops', 'insights', 'journal'];

// One in-page spotlight sequence per screen. `target` matches a
// data-tour="…" attribute rendered by that screen. `placement` is a hint —
// TourSpotlight clamps to the viewport regardless.
export const TOUR_STEPS = {
  today: [
    {
      target: 'today-hero',
      eyebrow: 'Home · 1 of 4',
      title: 'Your daily pulse',
      body: "A quote to sit with, plus a quick read on how the week's been feeling. Nothing to fill in if you don't feel like it.",
      placement: 'bottom',
    },
    {
      target: 'today-week',
      eyebrow: 'Home · 2 of 4',
      title: 'This week, at a glance',
      body: 'Every bar is a day you showed up. Your streak and average intensity live right below it.',
      placement: 'right',
    },
    {
      target: 'today-triggers',
      eyebrow: 'Home · 3 of 4',
      title: "What's been setting things off",
      body: 'Once a few entries are in, Nextmate spots what keeps coming up — deadlines, sleep, that one group chat.',
      placement: 'left',
    },
    {
      target: 'today-question',
      eyebrow: 'Home · 4 of 4',
      title: 'One good question a day',
      body: "Answer it or skip it — either way, a fresh one shows up tomorrow.",
      placement: 'top',
    },
  ],
  loops: [
    {
      target: 'loops-list',
      eyebrow: 'Loops · 1 of 6',
      title: 'Your pattern library',
      body: 'Every loop Nextmate has caught lives here — active ones on top, resolved ones below.',
      placement: 'right',
    },
    {
      target: 'loops-header',
      eyebrow: 'Loops · 2 of 6',
      title: 'The loop itself',
      body: 'The belief driving it, plus two moves: reflect on it now, or mark it resolved once it loosens its grip.',
      placement: 'bottom',
    },
    {
      target: 'loops-constellation',
      eyebrow: 'Loops · 3 of 6',
      title: 'The constellation',
      body: 'Each point is one time this pattern showed up. The more it circles back, the denser the sky gets.',
      placement: 'bottom',
    },
    {
      target: 'loops-stats',
      eyebrow: 'Loops · 4 of 6',
      title: 'The vitals',
      body: "Strength, frequency, intensity, and how long it's been running — the numbers behind the pattern.",
      placement: 'top',
    },
    {
      target: 'loops-features',
      eyebrow: 'Loops · 5 of 6',
      title: 'What feeds it',
      body: 'The triggers, moods, and moments this loop tends to travel with.',
      placement: 'top',
    },
    {
      target: 'loops-timeline',
      eyebrow: 'Loops · 6 of 6',
      title: 'Every time it showed up',
      body: 'A running log of the moments that built this pattern, newest first.',
      placement: 'top',
    },
  ],
  insights: [
    {
      target: 'insights-trend',
      eyebrow: 'Insights · 1 of 5',
      title: 'Emotions over time',
      body: 'How your mix of moods has shifted, day by day.',
      placement: 'bottom',
    },
    {
      target: 'insights-load',
      eyebrow: 'Insights · 2 of 5',
      title: 'Cognitive load',
      body: "How much you've been processing, and how intense it's felt while doing it.",
      placement: 'right',
    },
    {
      target: 'insights-spectrum',
      eyebrow: 'Insights · 3 of 5',
      title: 'Your emotional shape',
      body: 'The moods that show up most, mapped in one glance.',
      placement: 'left',
    },
    {
      target: 'insights-graph',
      eyebrow: 'Insights · 4 of 5',
      title: 'The knowledge graph',
      body: 'Drag, scroll, click a node — this is how your triggers and beliefs connect to each other.',
      placement: 'top',
    },
    {
      target: 'insights-heatmap',
      eyebrow: 'Insights · 5 of 5',
      title: 'The trigger heatmap',
      body: 'Darker means it hit harder. Watch for the same row lighting up again and again.',
      placement: 'top',
    },
  ],
  journal: [
    {
      target: 'journal-shelf',
      eyebrow: 'Journal · 1 of 4',
      title: 'Your bookshelf',
      body: 'Split entries into books — travel, anxious, gratitude, whatever makes sense to you.',
      placement: 'right',
    },
    {
      target: 'journal-streak',
      eyebrow: 'Journal · 2 of 4',
      title: 'Keeping the streak',
      body: 'One entry a day keeps it lit. No pressure — it resets, not punishes.',
      placement: 'right',
    },
    {
      target: 'journal-compose',
      eyebrow: 'Journal · 3 of 4',
      title: 'Write it your way',
      body: 'Mood, fonts, stickers, page themes — dress the page however you want before you keep it.',
      placement: 'top',
    },
    {
      target: 'journal-entries',
      eyebrow: 'Journal · 4 of 4',
      title: 'Past pages',
      body: "Everything you've kept, grouped by day, always here to reread.",
      placement: 'top',
    },
  ],
  chat: [
    {
      target: 'chat-input',
      eyebrow: 'One last thing · 1 of 2',
      title: 'Just start typing',
      body: "Say whatever's on your mind — Nextmate responds in real time. Hit the mic if you'd rather talk it out.",
      placement: 'top',
    },
    {
      target: 'chat-panel',
      eyebrow: 'One last thing · 2 of 2',
      title: 'Patterns, live',
      body: 'Any active loop shows up here as you talk, plus a running summary of the thread.',
      placement: 'left',
    },
  ],
};

// Copy for the lightweight "go click it" nudge card shown between sections,
// keyed by the section the user is being pointed toward.
export const NUDGE_COPY = {
  loops: {
    eyebrow: "Home's done!",
    title: 'Loops, next',
    body: "That's Home covered. See the pulsing Loops icon in the sidebar? Give it a click.",
  },
  insights: {
    eyebrow: 'Nice.',
    title: 'Now, Insights',
    body: 'One more click — Insights is glowing over there.',
  },
  journal: {
    eyebrow: 'Almost there.',
    title: 'Last stop: Journal',
    body: 'Head over to Journal — it just lit up in the sidebar.',
  },
};

export const REFLECT_HYPE_COPY = {
  eyebrow: "That's the whole tour.",
  title: 'Now the actual part',
  body: "Everything before this was the map. This button is the territory — click Let's Talk and start talking to Nextmate for real.",
};
