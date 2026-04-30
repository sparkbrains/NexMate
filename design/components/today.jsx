// Today — the opening surface. Not a journal — a dashboard of what to reflect on.

const TodayScreen = ({ onNav }) => (
  <div className="nm-main">
    <TopBar crumb={<><b>Today</b> <span className="sep">/</span> Thu Apr 23</>}>
      <button className="nm-btn ghost"><Icon name="search" size={12} /> Search</button>
      <button className="nm-btn"><Icon name="mic" size={12} /> Voice note</button>
      <button className="nm-btn primary" onClick={() => onNav && onNav('chat')}><Icon name="plus" size={12} /> Begin reflection</button>
    </TopBar>

    <div className="nm-content">
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Greeting */}
        <div style={{ marginBottom: 32 }}>
          <div className="nm-eyebrow" style={{ marginBottom: 14 }}>Morning, Maya · 07:42 · 9° drizzle</div>
          <h1 className="nm-h1">
            You've been circling<br />
            <em>the same question</em> about work<br />
            for nine days.
          </h1>
          <p className="nm-lede" style={{ marginTop: 18, maxWidth: 620 }}>
            Nextmate noticed something across your last fourteen entries. Want to sit with it before the day starts?
          </p>
        </div>

        {/* Loop card — hero */}
        <div className="nm-card loop-alert nm-fade-up" style={{ marginBottom: 24, padding: '26px 30px' }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <LoopRing strength={0.78} size={96} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="nm-chip accent"><span className="nm-dot" />Active loop</span>
                <span className="nm-tag">strength 0.78 · 9 / 14 entries · trending up</span>
              </div>
              <h2 className="nm-h2" style={{ marginBottom: 10, fontStyle: 'italic', fontWeight: 400 }}>
                "If I slow down, I'll fall behind."
              </h2>
              <p className="nm-body" style={{ margin: 0, maxWidth: 560 }}>
                This belief keeps surfacing around <b>work</b> and <b>sleep</b>, usually late at night. It pairs with an intensity spike (avg 7.2) and negative valence. It's been louder this week than last.
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                <button className="nm-btn accent" onClick={() => onNav && onNav('chat')}>Reflect on this <Icon name="arrow" size={12} /></button>
                <button className="nm-btn" onClick={() => onNav && onNav('loops')}>See all 9 occurrences</button>
                <button className="nm-btn ghost">Not today</button>
              </div>
            </div>
          </div>
        </div>

        {/* 3-column overview */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Recent threads */}
          <div className="nm-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div className="nm-h3">Recent threads</div>
              <div className="nm-meta">last 5 · open one to continue</div>
            </div>
            <ThreadRow title="The 9pm promise, again" preview="Kept running the meeting with Priya in my head. Told myself one more hour…" date="Apr 22" msgs={12} loop intensity={7} />
            <ThreadRow title="Coffee with Jun" preview="He asked why I always pick the hardest version of the thing." date="Apr 22" msgs={6} intensity={5} positive />
            <ThreadRow title="Why I said yes to Priya" preview="A part of me knew before I said it that I was already full." date="Apr 20" msgs={9} loop intensity={8} />
            <ThreadRow title="A run after standup" preview="Felt like myself again for an hour. Wondering what that means." date="Apr 20" msgs={4} intensity={3} positive />
            <ThreadRow title="Mom called" preview="Didn't know what to say about the new job thing." date="Apr 18" msgs={11} intensity={6} last />
          </div>

          {/* Week summary — ink card */}
          <div className="nm-card ink">
            <div className="nm-eyebrow" style={{ marginBottom: 16 }}>This week · so far</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 54, lineHeight: 1, letterSpacing: '-0.03em' }}>6</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-4)' }}>of 7</div>
            </div>
            <div className="nm-body" style={{ color: 'var(--ink-4)', marginBottom: 20 }}>days with reflections</div>

            <WeekDots days={[
              { v: 7, e: 'overwhelm' }, { v: 7, e: 'anxious' }, { v: 9, e: 'overwhelm' },
              { v: 6, e: 'tired' }, { v: 3, e: 'calm' }, { v: 5, e: 'hopeful' }, { v: null, e: null }
            ]} />

            <div className="nm-hr" style={{ background: 'rgba(255,255,255,0.08)', margin: '20px 0 14px' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div className="nm-tag" style={{ color: 'var(--ink-4)' }}>Avg intensity</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>6.2 <span className="nm-meta" style={{ color: 'var(--ink-4)' }}>−0.3</span></div>
              </div>
              <div>
                <div className="nm-tag" style={{ color: 'var(--ink-4)' }}>New loops</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)' }}>1 <span className="nm-meta" style={{ color: 'var(--ink-4)' }}>candidate</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="nm-card soft">
            <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Triggers, last 7 days</div>
            <TriggerBar label="work" pct={68} color="var(--accent)" />
            <TriggerBar label="sleep" pct={42} color="var(--clay)" />
            <TriggerBar label="friendship" pct={28} color="var(--teal)" />
            <TriggerBar label="health" pct={18} color="var(--gold)" last />
          </div>
          <div className="nm-card soft">
            <div className="nm-eyebrow" style={{ marginBottom: 10 }}><Icon name="sparkle" size={10} /> Echo from 68 days ago</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.45, fontStyle: 'italic', color: 'var(--ink)', letterSpacing: '-0.005em' }}>
              "The days I slept less were never the days I did more — only the days I felt worse."
            </div>
            <div className="nm-meta" style={{ marginTop: 12 }}>— you, Feb 14</div>
          </div>
          <div className="nm-card soft">
            <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Today's open question</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.4, color: 'var(--ink)', letterSpacing: '-0.005em' }}>
              What does <em style={{ color: 'var(--accent)' }}>"falling behind"</em> actually look like? Has it ever happened?
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button className="nm-btn" onClick={() => onNav && onNav('chat')}>Answer <Icon name="arrow" size={11} /></button>
              <button className="nm-btn ghost">Skip</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ThreadRow = ({ title, preview, date, msgs, loop, intensity, positive, last }) => (
  <div style={{ padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--rule-soft)', cursor: 'pointer' }}>
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          {loop && <span style={{ color: 'var(--accent)', fontSize: 10 }}>◐</span>}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>{title}</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="nm-meta" style={{ color: 'var(--ink-3)' }}>{date}</div>
        <div className="nm-meta" style={{ fontSize: 9.5 }}>
          {msgs} msgs · <span style={{ color: positive ? 'var(--teal)' : intensity >= 7 ? 'var(--accent)' : 'var(--ink-4)' }}>i{intensity}</span>
        </div>
      </div>
    </div>
  </div>
);

const WeekDots = ({ days }) => {
  const names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const colorFor = (e) => ({
    overwhelm: 'var(--accent)', anxious: 'var(--clay)', tired: 'var(--ink-4)',
    calm: 'var(--teal)', hopeful: 'var(--teal)',
  }[e] || 'var(--ink-4)');
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
      {days.map((d, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            height: d.v ? 34 + d.v * 4 : 14,
            background: d.v ? colorFor(d.e) : 'transparent',
            border: d.v ? 'none' : '1px dashed rgba(255,255,255,0.15)',
            opacity: d.v ? 0.4 + (d.v / 10) * 0.6 : 1,
            borderRadius: 2,
          }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-4)', marginTop: 5 }}>{names[i]}</div>
        </div>
      ))}
    </div>
  );
};

const TriggerBar = ({ label, pct, color, last }) => (
  <div style={{ marginBottom: last ? 0 : 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>{label}</span>
      <span className="nm-meta">{pct}%</span>
    </div>
    <div style={{ height: 3, background: 'var(--rule-soft)', borderRadius: 0, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  </div>
);

Object.assign(window, { TodayScreen });
