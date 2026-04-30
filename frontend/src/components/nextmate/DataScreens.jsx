import { Icon, TopBar, LoopRing } from './Shell';

const EmotionChart = () => {
  const days = 30, w = 600, h = 170, dx = w / (days - 1);
  const bands = [
    { c: 'var(--accent)', f: i => 0.32 + Math.sin(i * 0.4) * 0.04 + (i > 18 ? -0.06 : 0) },
    { c: 'var(--clay)', f: i => 0.24 + Math.cos(i * 0.3) * 0.05 },
    { c: 'var(--teal)', f: i => 0.18 + (i > 15 ? 0.06 : 0) },
    { c: 'var(--ink-3)', f: () => 0.14 },
    { c: 'var(--teal-soft)', f: () => 0.12 },
  ];
  const cum = new Array(days).fill(0);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {bands.map((b, bi) => {
        const top = [], bot = [];
        for (let i = 0; i < days; i++) {
          const p = cum[i]; cum[i] += b.f(i);
          top.push([i * dx, h - cum[i] * h * 0.9]);
          bot.push([i * dx, h - p * h * 0.9]);
        }
        return <path key={bi} d={'M' + top.map(p => p.join(',')).join(' L ') + ' L ' + bot.reverse().map(p => p.join(',')).join(' L ') + ' Z'} fill={b.c} opacity="0.88" />;
      })}
      <line x1="0" y1={h} x2={w} y2={h} stroke="var(--rule)" />
    </svg>
  );
};

const IntensityBars = () => {
  const counts = [0, 0, 1, 2, 3, 3, 4, 6, 4, 3], max = 6;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 96 }}>
      {counts.map((c, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', height: `${(c / max) * 100}%`, background: i + 1 === 7 ? 'var(--accent)' : i >= 6 ? 'var(--clay)' : 'var(--rule-soft)', minHeight: c ? 2 : 0 }} />
          <span className="nm-meta" style={{ fontSize: 9 }}>{i + 1}</span>
        </div>
      ))}
    </div>
  );
};

const BigStat = ({ label, value, color }) => (
  <div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1, color: color || 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</div>
    <div className="nm-meta" style={{ marginTop: 4 }}>{label}</div>
  </div>
);

const TriggerHeat = () => {
  const triggers = ['work', 'sleep', 'friendship', 'health', 'family'], cols = 30;
  const intensity = (t, i) => {
    if (t === 'work') return Math.max(0, Math.sin(i * 0.5) * 0.6 + 0.5 + (i > 18 ? 0.3 : 0));
    if (t === 'sleep') return Math.max(0, Math.cos(i * 0.4) * 0.5 + 0.3 + (i > 15 ? 0.2 : 0));
    if (t === 'friendship') return i % 4 === 0 ? 0.5 : (i % 7 === 0 ? 0.3 : 0);
    if (t === 'health') return i % 5 === 2 ? 0.4 : 0;
    return i % 9 === 0 ? 0.3 : 0;
  };
  const shade = v => v <= 0 ? 'var(--rule-soft)' : v < 0.3 ? 'var(--loop-light)' : v < 0.6 ? 'var(--loop-medium)' : 'var(--loop-strong)';
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, marginLeft: 88, marginBottom: 6 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="nm-meta" style={{ flex: 1, fontSize: 9, textAlign: 'center', color: i % 7 === 0 ? 'var(--ink-2)' : 'transparent' }}>{i % 7 === 0 ? `Apr ${i + 1}` : '·'}</div>
        ))}
      </div>
      {triggers.map(t => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 80, fontSize: 12, textAlign: 'right', fontFamily: 'var(--font-display)' }}>{t}</div>
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {Array.from({ length: cols }).map((_, i) => <div key={i} style={{ flex: 1, aspectRatio: '1', background: shade(intensity(t, i)) }} />)}
          </div>
        </div>
      ))}
    </div>
  );
};

const LoopSummary = () => {
  const items = [
    { n: `"If I slow down, I'll fall behind."`, s: 'active', o: 9, st: 0.78 },
    { n: `"I should already know this."`, s: 'active', o: 6, st: 0.52 },
    { n: `"People leave when I'm honest."`, s: 'active', o: 4, st: 0.41 },
    { n: `"I'm not doing enough."`, s: 'resolved', o: 11, st: 0.22 },
    { n: `"Rest means I'm lazy."`, s: 'resolved', o: 7, st: 0.18 },
  ];
  return (
    <div>
      {items.map((l, i) => (
        <div key={i} style={{ padding: '10px 0', borderBottom: i === items.length - 1 ? 'none' : '1px dashed var(--rule)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontStyle: 'italic' }}>{l.n}</div>
            <span className={"nm-chip " + (l.s === 'resolved' ? 'teal' : 'accent')} style={{ fontSize: 9.5 }}>{l.s}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 2, background: 'var(--rule-soft)', overflow: 'hidden' }}>
              <div style={{ width: `${l.st * 100}%`, height: '100%', background: l.s === 'resolved' ? 'var(--teal)' : 'var(--accent)' }} />
            </div>
            <span className="nm-meta">{l.o}× · {l.st.toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const G = ({ label, before, after, good, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)', gap: 8 }}>
    <div style={{ flex: 1, fontSize: 13 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>{before}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>→</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: good ? 'var(--teal)' : 'var(--ink)' }}>{after}</div>
    <span style={{ fontSize: 13, color: good ? 'var(--teal)' : 'var(--accent)' }}>{good ? '↑' : '↓'}</span>
  </div>
);

export const InsightsScreen = () => (
  <div className="nm-main">
    <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Insights</b></>}>
      <div style={{ display: 'flex', gap: 2, border: '1px solid var(--rule)', borderRadius: 3, padding: 2 }}>
        {['7d', '30d', '90d', '1y'].map((r, i) => (
          <button key={r} className="nm-btn" style={{ border: 'none', padding: '3px 10px', fontSize: 11, background: i === 1 ? 'var(--ink)' : 'transparent', color: i === 1 ? 'var(--paper)' : 'var(--ink-2)' }}>{r}</button>
        ))}
      </div>
      <button className="nm-btn"><Icon name="download" size={12} /> Export</button>
    </TopBar>

    <div className="nm-content">
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
          <div>
            <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Last 30 days · 26 threads · 112 messages</div>
            <h1 className="nm-h1">The shape of your month.</h1>
          </div>
          <div className="nm-meta" style={{ textAlign: 'right', lineHeight: 1.7 }}>
            avg intensity <b style={{ color: 'var(--ink)' }}>6.2</b> <span style={{ color: 'var(--accent)' }}>+0.4</span><br />
            loops closed <b style={{ color: 'var(--teal)' }}>2</b> · new <b style={{ color: 'var(--accent)' }}>1</b>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="nm-card">
            <div style={{ marginBottom: 14 }}>
              <div className="nm-eyebrow">Emotion trend</div>
              <div className="nm-h3" style={{ marginTop: 4 }}>Overwhelm softening mid-month</div>
            </div>
            <EmotionChart />
            <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
              {[['overwhelm', 'var(--accent)', 32], ['anxious', 'var(--clay)', 24], ['hopeful', 'var(--teal)', 18], ['tired', 'var(--ink-3)', 14], ['calm', 'var(--teal-soft)', 12]].map(([n, c, p]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                  <span style={{ width: 10, height: 10, background: c, borderRadius: 1 }} />
                  <span>{n}</span><span className="nm-meta">{p}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="nm-card">
            <div className="nm-eyebrow" style={{ marginBottom: 4 }}>Intensity distribution</div>
            <div className="nm-h3" style={{ marginBottom: 18 }}>Peaks cluster at 7</div>
            <IntensityBars />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
              <BigStat label="avg" value="6.2" />
              <BigStat label="peak · Apr 8" value="9" color="var(--accent)" />
              <BigStat label="low · Apr 20" value="3" color="var(--teal)" />
            </div>
          </div>
        </div>

        <div className="nm-card" style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="nm-eyebrow">Trigger heatmap</div>
            <div className="nm-h3" style={{ marginTop: 4 }}>When each trigger showed up</div>
          </div>
          <TriggerHeat />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="nm-card">
            <div className="nm-eyebrow" style={{ marginBottom: 4 }}>Loop occurrences</div>
            <div className="nm-h3" style={{ marginBottom: 18 }}>3 active · 2 resolved</div>
            <LoopSummary />
          </div>
          <div className="nm-card soft">
            <div className="nm-eyebrow" style={{ marginBottom: 12 }}>Growth</div>
            <G label="Threads / week" before="4.2" after="5.8" good />
            <G label="Avg intensity" before="7.1" after="6.2" good />
            <G label="Reflection depth" before="62w" after="108w" good />
            <G label="Resolved loops" before="0" after="2" good last />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const WStat = ({ label, value, delta, good }) => (
  <div style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 14 }}>
    <div className="nm-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
    {delta && <div className="nm-meta" style={{ marginTop: 4, color: good ? 'var(--teal)' : 'var(--ink-4)' }}>{delta} vs last</div>}
  </div>
);

const Sec = ({ eye, title, children }) => (
  <section style={{ marginBottom: 32 }}>
    <div className="nm-eyebrow" style={{ marginBottom: 6 }}>{eye}</div>
    {title && <h2 className="nm-h2" style={{ marginBottom: 14 }}>{title}</h2>}
    {children}
  </section>
);

const Ribbon = () => {
  const days = [
    { d: 'Mon', v: 7, e: 'overwhelm' }, { d: 'Tue', v: 7, e: 'anxious' }, { d: 'Wed', v: 9, e: 'overwhelm' },
    { d: 'Thu', v: 6, e: 'tired' }, { d: 'Fri', v: 3, e: 'calm' }, { d: 'Sat', v: 5, e: 'hopeful' }, { d: 'Sun', v: 6, e: 'reflective' },
  ];
  const col = e => ({ overwhelm: 'var(--accent)', anxious: 'var(--clay)', tired: 'var(--ink-3)', calm: 'var(--teal)', hopeful: 'var(--teal)', reflective: 'var(--gold)' }[e]);
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {days.map(d => (
        <div key={d.d} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ height: 80, background: col(d.e), opacity: 0.35 + (d.v / 10) * 0.6, borderRadius: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)' }}>{d.v}</div>
          </div>
          <div className="nm-meta" style={{ marginTop: 6 }}>{d.d}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{d.e}</div>
        </div>
      ))}
    </div>
  );
};

const TRanked = () => {
  const t = [['work', 68, 'var(--accent)'], ['sleep', 42, 'var(--clay)'], ['friendship', 28, 'var(--teal)'], ['health', 18, 'var(--gold)'], ['family', 8, 'var(--ink-3)']];
  return (
    <div>
      {t.map(([n, p, c], i) => (
        <div key={n} style={{ display: 'grid', gridTemplateColumns: '20px 100px 1fr 50px', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i === t.length - 1 ? 'none' : '1px dashed var(--rule)' }}>
          <span className="nm-meta">{String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{n}</span>
          <div style={{ height: 4, background: 'var(--rule-soft)', overflow: 'hidden' }}><div style={{ width: `${p}%`, height: '100%', background: c }} /></div>
          <span className="nm-meta" style={{ textAlign: 'right' }}>{p}%</span>
        </div>
      ))}
    </div>
  );
};

const LWeek = ({ quote, change, delta, note, strength, resolved }) => (
  <div style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: '1px dashed var(--rule)' }}>
    <LoopRing strength={strength} size={56} resolved={resolved} />
    <div style={{ flex: 1 }}>
      <span className={"nm-chip " + (resolved ? 'teal' : 'accent')} style={{ fontSize: 9.5 }}>{change} · {delta}</span>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: '6px 0', fontStyle: 'italic', letterSpacing: '-0.01em' }}>{quote}</div>
      <div className="nm-body" style={{ fontSize: 13 }}>{note}</div>
    </div>
  </div>
);

export const WeeklyScreen = () => (
  <div className="nm-main">
    <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Weekly report</b></>}>
      <button className="nm-btn"><Icon name="back" size={12} /> Week 15</button>
      <button className="nm-btn">Week 17 <Icon name="arrow" size={12} /></button>
      <button className="nm-btn primary"><Icon name="download" size={12} /> PDF</button>
    </TopBar>
    <div className="nm-content">
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Week 16 · Apr 13 – Apr 19, 2026</div>
        <h1 className="nm-h1" style={{ marginBottom: 16 }}>
          A week of circling the same question —<br />
          <em>and the first real hint of an answer.</em>
        </h1>
        <p className="nm-lede" style={{ marginBottom: 28 }}>
          You reflected six of seven days. Intensity stayed in the upper range until Friday, when a run and an early night dropped it to a 3 — the lowest in three weeks. One loop tightened; one loosened.
        </p>

        <div className="nm-grid-4" style={{ marginBottom: 32 }}>
          <WStat label="Threads" value="11" delta="+2" />
          <WStat label="Avg intensity" value="6.4" delta="−0.3" good />
          <WStat label="Active loops" value="3" />
          <WStat label="New patterns" value="1" />
        </div>

        <Sec eye="01 · Emotional trend" title="Overwhelm peaked Wednesday, softened Friday.">
          <Ribbon />
          <p className="nm-body" style={{ marginTop: 14 }}>
            The 9pm work-stop promise appeared four times. Each time, paired with <b>overwhelm</b> at intensity 7+. By Friday, after a run with Jun, the same trigger appeared at intensity 3 and the word <i>"okay"</i> — the first neutral valence on work in 18 days.
          </p>
        </Sec>

        <Sec eye="02 · Triggers" title="Work is still the gravity well.">
          <TRanked />
        </Sec>

        <Sec eye="03 · Loops" title="One tightened. One loosened.">
          <LWeek quote={`"If I slow down, I'll fall behind."`} change="tightened" delta="+0.12" note="Appeared 4 times, up from 2. Pairs with sleep and work." strength={0.78} />
          <LWeek quote={`"I'm not doing enough."`} change="loosened" delta="−0.08" note="Only once this week. You've been pushing back on it in threads." strength={0.22} resolved />
        </Sec>

        <Sec eye="04 · Growth">
          <p className="nm-body">
            Longer reflections this week (avg 118 words, up from 94). Ten question marks, up from four. The Friday entry held your first candidate belief in a month:
          </p>
          <blockquote style={{ margin: '18px 0', padding: '16px 24px', borderLeft: '2px solid var(--accent)', fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.35, fontStyle: 'italic', letterSpacing: '-0.015em' }}>
            "Maybe being needed and needing myself aren't the same thing."
          </blockquote>
          <p className="nm-body">Nextmate logged this as a candidate belief. It won't become a core pattern until it reaffirms five times.</p>
        </Sec>

        <div className="nm-card ink" style={{ marginTop: 32 }}>
          <div className="nm-eyebrow" style={{ marginBottom: 10 }}>For next week</div>
          <div className="nm-h2" style={{ color: 'var(--paper)', marginBottom: 16 }}>One suggestion. One question.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
            <div>
              <div className="nm-tag" style={{ color: 'var(--ink-4)', marginBottom: 6 }}>Suggest</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.45, letterSpacing: '-0.005em' }}>
                Try reflecting twice on work-heavy days — once before 9pm, once before bed. The pattern lives in the gap.
              </div>
            </div>
            <div>
              <div className="nm-tag" style={{ color: 'var(--ink-4)', marginBottom: 6 }}>Ask yourself</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.45, letterSpacing: '-0.005em' }}>
                What does <em style={{ color: 'var(--accent)' }}>"falling behind"</em> actually look like? Has it ever happened?
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 40, paddingBottom: 20 }}>
          <div className="nm-meta">Generated Sun Apr 20 · 11 threads · 184 days with Nextmate</div>
        </div>
      </div>
    </div>
  </div>
);