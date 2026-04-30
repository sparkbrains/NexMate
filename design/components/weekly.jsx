// Weekly Report — narrative + numbers

const WeeklyScreen = () => (
  <div className="nm-main">
    <TopBar crumb={<>Patterns · <b>Weekly report</b></>}>
      <button className="nm-btn"><Icon name="arrow" style={{ transform: 'rotate(180deg)' }} /> Week 15</button>
      <button className="nm-btn">Week 17 <Icon name="arrow" /></button>
      <button className="nm-btn primary"><Icon name="download" /> Save PDF</button>
    </TopBar>

    <div className="nm-content">
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Week 16 · Apr 13 – Apr 19, 2026</div>
        <h1 className="nm-h1" style={{ marginBottom: 16 }}>
          A week of circling the same question —<br />
          <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>and the first real hint of an answer.</span>
        </h1>
        <p className="nm-lede" style={{ marginBottom: 28 }}>
          You reflected on six of seven days. Your intensity stayed in the upper range until Friday, when a run and an early night dropped it to a 3 — the lowest in three weeks. One loop tightened; one loosened.
        </p>

        <div className="nm-grid-4" style={{ marginBottom: 32 }}>
          <Stat label="Entries" value="11" delta="+2" />
          <Stat label="Avg intensity" value="6.4" delta="−0.3" good />
          <Stat label="Active loops" value="3" />
          <Stat label="New patterns" value="1" />
        </div>

        <Section eyebrow="01 · Emotional trend" title="Overwhelm peaked Wednesday, softened Friday.">
          <WeekRibbon />
          <p className="nm-body" style={{ marginTop: 14 }}>
            The 9pm work-stop promise appeared four times. Each time it was paired with <b>overwhelm</b> and an intensity of 7 or higher. By Friday evening, after a run with Jun, the same trigger (work) appeared with an intensity of 3 and the word <i>"okay"</i> — the first neutral valence on that trigger in 18 days.
          </p>
        </Section>

        <Section eyebrow="02 · Trigger frequency" title="Work is still the gravity well.">
          <TriggerRanked />
        </Section>

        <Section eyebrow="03 · Loops" title="One tightened. One loosened.">
          <LoopWeekCard
            quote={`"If I slow down, I'll fall behind."`}
            change="tightened"
            delta="+0.12"
            note="Appeared 4 times this week, up from 2. Pairs with sleep and work."
            strength={0.78}
          />
          <LoopWeekCard
            quote={`"I'm not doing enough."`}
            change="loosened"
            delta="−0.08"
            note="Only appeared once this week. You've been pushing back on it in the chat."
            strength={0.22}
            resolved
          />
        </Section>

        <Section eyebrow="04 · Growth">
          <p className="nm-body">
            You wrote longer entries this week (avg 118 words, up from 94) and asked yourself more questions — ten question marks, up from four. The Friday entry contained your first new core belief in a month:
          </p>
          <blockquote style={{
            margin: '18px 0', padding: '16px 22px',
            borderLeft: '2px solid var(--accent)',
            fontFamily: 'var(--font-serif)', fontSize: 20, lineHeight: 1.4,
            fontStyle: 'italic',
          }}>
            "Maybe being needed and needing myself aren't the same thing."
          </blockquote>
          <p className="nm-body">
            NexMate logged this as a candidate belief. It won't become a core pattern until it reaffirms five times.
          </p>
        </Section>

        <div className="nm-card ink" style={{ marginTop: 32 }}>
          <div className="nm-eyebrow" style={{ marginBottom: 10 }}>For next week</div>
          <div className="nm-h2" style={{ color: 'var(--paper)', marginBottom: 12 }}>
            One suggestion, one question.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div className="nm-tag" style={{ color: 'var(--ink-4)', marginBottom: 6 }}>Suggest</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, lineHeight: 1.45 }}>
                Try logging a second time on work-heavy days — once before 9pm, once before bed. The pattern shows up in the gap.
              </div>
            </div>
            <div>
              <div className="nm-tag" style={{ color: 'var(--ink-4)', marginBottom: 6 }}>Ask yourself</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, lineHeight: 1.45 }}>
                What does "falling behind" actually look like? Has it ever happened?
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 40, paddingBottom: 20 }}>
          <div className="nm-meta">Generated Sun Apr 20 · 11 entries · 184 days with NexMate</div>
        </div>
      </div>
    </div>
  </div>
);

const Stat = ({ label, value, delta, good }) => (
  <div style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 12 }}>
    <div className="nm-eyebrow" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: 1 }}>{value}</div>
    {delta && <div className="nm-meta" style={{ marginTop: 4, color: good ? 'var(--sage)' : 'var(--ink-3)' }}>{delta} vs last wk</div>}
  </div>
);

const Section = ({ eyebrow, title, children }) => (
  <section style={{ marginBottom: 32 }}>
    <div className="nm-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>
    {title && <h2 className="nm-h2" style={{ marginBottom: 14 }}>{title}</h2>}
    {children}
  </section>
);

const WeekRibbon = () => {
  const days = [
    { d: 'Mon', v: 7, e: 'overwhelm' },
    { d: 'Tue', v: 7, e: 'anxious' },
    { d: 'Wed', v: 9, e: 'overwhelm' },
    { d: 'Thu', v: 6, e: 'tired' },
    { d: 'Fri', v: 3, e: 'calm' },
    { d: 'Sat', v: 5, e: 'hopeful' },
    { d: 'Sun', v: 6, e: 'reflective' },
  ];
  const colorFor = (e) => ({
    overwhelm: 'var(--accent)',
    anxious: 'var(--clay)',
    tired: 'var(--ink-3)',
    calm: 'var(--sage)',
    hopeful: 'var(--sage)',
    reflective: 'var(--gold)',
  }[e] || 'var(--clay)');
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {days.map(d => (
        <div key={d.d} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            height: 80,
            background: colorFor(d.e),
            opacity: 0.35 + (d.v / 10) * 0.65,
            borderRadius: 4,
            position: 'relative',
          }}>
            <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--ink)' }}>{d.v}</div>
          </div>
          <div className="nm-meta" style={{ marginTop: 6 }}>{d.d}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{d.e}</div>
        </div>
      ))}
    </div>
  );
};

const TriggerRanked = () => {
  const t = [
    ['work', 68, 'var(--accent)'],
    ['sleep', 42, 'var(--clay)'],
    ['friendship', 28, 'var(--sage)'],
    ['health', 18, 'var(--gold)'],
    ['family', 8, 'var(--ink-3)'],
  ];
  return (
    <div>
      {t.map(([n, p, c], i) => (
        <div key={n} style={{ display: 'grid', gridTemplateColumns: '20px 100px 1fr 50px', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i === t.length - 1 ? 'none' : '1px dashed var(--rule)' }}>
          <span className="nm-meta">{String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>{n}</span>
          <div style={{ height: 6, background: 'var(--paper-3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${p}%`, height: '100%', background: c }} />
          </div>
          <span className="nm-meta" style={{ textAlign: 'right' }}>{p}%</span>
        </div>
      ))}
    </div>
  );
};

const LoopWeekCard = ({ quote, change, delta, note, strength, resolved }) => (
  <div style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: '1px dashed var(--rule)' }}>
    <LoopRing strength={strength} size={56} />
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className={"nm-chip " + (resolved ? 'sage' : 'accent')} style={{ fontSize: 10 }}>{change} · {delta}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, marginBottom: 6 }}>{quote}</div>
      <div className="nm-body" style={{ fontSize: 13 }}>{note}</div>
    </div>
  </div>
);

Object.assign(window, { WeeklyScreen });
