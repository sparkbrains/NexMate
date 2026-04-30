// Insights Dashboard — emotion, intensity, triggers, loops

const InsightsScreen = () => {
  const [range, setRange] = React.useState('30d');
  return (
    <div className="nm-main">
      <TopBar crumb={<>Patterns · <b>Insights</b></>}>
        <div style={{ display: 'flex', gap: 4, border: '1px solid var(--rule)', borderRadius: 4, padding: 2 }}>
          {['7d', '30d', '90d', '1y'].map(r => (
            <button key={r} onClick={() => setRange(r)} className="nm-btn" style={{
              border: 'none', padding: '4px 10px', fontSize: 11,
              background: range === r ? 'var(--ink)' : 'transparent',
              color: range === r ? 'var(--paper)' : 'var(--ink-2)'
            }}>{r}</button>
          ))}
        </div>
        <button className="nm-btn"><Icon name="download" /> Export</button>
      </TopBar>

      <div className="nm-content">
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
            <div>
              <div className="nm-eyebrow" style={{ marginBottom: 8 }}>Last 30 days · 26 entries</div>
              <h1 className="nm-h1">The shape of your month.</h1>
            </div>
            <div className="nm-meta" style={{ textAlign: 'right', lineHeight: 1.6 }}>
              avg intensity <b style={{ color: 'var(--ink)' }}>6.2</b> · +0.4 vs last<br />
              loops closed <b style={{ color: 'var(--sage)' }}>2</b> · new <b style={{ color: 'var(--accent)' }}>1</b>
            </div>
          </div>

          {/* Row 1: emotion + intensity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="nm-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div>
                  <div className="nm-eyebrow">Emotion trend</div>
                  <div className="nm-h3" style={{ marginTop: 4 }}>Mostly overwhelm, softening mid-month</div>
                </div>
                <div className="nm-meta">stacked · 7-day avg</div>
              </div>
              <EmotionChart />
              <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                {[
                  ['overwhelm', 'var(--accent)', 32],
                  ['anxious', 'var(--clay)', 24],
                  ['hopeful', 'var(--sage)', 18],
                  ['tired', 'var(--ink-3)', 14],
                  ['calm', 'var(--sage-soft)', 12],
                ].map(([n, c, p]) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                    <span style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
                    <span>{n}</span>
                    <span className="nm-meta">{p}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="nm-card">
              <div className="nm-eyebrow" style={{ marginBottom: 4 }}>Intensity distribution</div>
              <div className="nm-h3" style={{ marginBottom: 18 }}>Peaks cluster at 7</div>
              <IntensityBars />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>6.2</div>
                  <div className="nm-meta">avg</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>9</div>
                  <div className="nm-meta">peak · Apr 8</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--sage)' }}>3</div>
                  <div className="nm-meta">low · Apr 20</div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: trigger heatmap */}
          <div className="nm-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div>
                <div className="nm-eyebrow">Trigger heatmap</div>
                <div className="nm-h3" style={{ marginTop: 4 }}>When each trigger showed up</div>
              </div>
              <div className="nm-meta">darker = higher intensity</div>
            </div>
            <TriggerHeatmap />
          </div>

          {/* Row 3: loops + growth */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="nm-card">
              <div className="nm-eyebrow" style={{ marginBottom: 4 }}>Loop occurrences</div>
              <div className="nm-h3" style={{ marginBottom: 18 }}>3 active · 2 resolved</div>
              <LoopBars />
            </div>
            <div className="nm-card soft">
              <div className="nm-eyebrow" style={{ marginBottom: 12 }}>Growth indicators</div>
              <GrowthRow label="Entries per week" before="4.2" after="5.8" up />
              <GrowthRow label="Avg intensity" before="7.1" after="6.2" down good />
              <GrowthRow label="Reflection depth" before="62 words" after="108 words" up good />
              <GrowthRow label="Resolved loops" before="0" after="2" up good last />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const EmotionChart = () => {
  const days = 30;
  const bands = [
    { c: 'var(--accent)', fn: i => 0.32 + Math.sin(i * 0.4) * 0.04 + (i > 18 ? -0.06 : 0) },
    { c: 'var(--clay)', fn: i => 0.24 + Math.cos(i * 0.3) * 0.05 },
    { c: 'var(--sage)', fn: i => 0.18 + (i > 15 ? 0.06 : 0) },
    { c: 'var(--ink-3)', fn: i => 0.14 },
    { c: 'var(--sage-soft)', fn: i => 0.12 },
  ];
  const w = 600, h = 180;
  const dx = w / (days - 1);
  let cumulative = new Array(days).fill(0);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {bands.map((b, bi) => {
        const top = [], bot = [];
        for (let i = 0; i < days; i++) {
          const prev = cumulative[i];
          const v = b.fn(i);
          cumulative[i] = prev + v;
          top.push([i * dx, h - cumulative[i] * h * 0.9]);
          bot.push([i * dx, h - prev * h * 0.9]);
        }
        const path = 'M' + top.map(p => p.join(',')).join(' L ') +
          ' L ' + bot.reverse().map(p => p.join(',')).join(' L ') + ' Z';
        return <path key={bi} d={path} fill={b.c} opacity="0.9" />;
      })}
      <line x1="0" y1={h} x2={w} y2={h} stroke="var(--rule)" />
    </svg>
  );
};

const IntensityBars = () => {
  const counts = [0, 0, 1, 2, 3, 3, 4, 6, 4, 3]; // 1..10
  const max = 6;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100 }}>
      {counts.map((c, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%',
            height: `${(c / max) * 100}%`,
            background: i + 1 === 7 ? 'var(--accent)' : (i + 1 >= 7 ? 'var(--clay)' : 'var(--paper-3)'),
            borderRadius: '2px 2px 0 0',
            minHeight: c ? 2 : 0,
          }} />
          <span className="nm-meta" style={{ fontSize: 9.5 }}>{i + 1}</span>
        </div>
      ))}
    </div>
  );
};

const TriggerHeatmap = () => {
  const triggers = ['work', 'sleep', 'friendship', 'health', 'family'];
  const cols = 30;
  const intensity = (t, i) => {
    if (t === 'work') return Math.max(0, Math.sin(i * 0.5) * 0.6 + 0.5 + (i > 18 ? 0.3 : 0));
    if (t === 'sleep') return Math.max(0, Math.cos(i * 0.4) * 0.5 + 0.3 + (i > 15 ? 0.2 : 0));
    if (t === 'friendship') return i % 4 === 0 ? 0.5 : (i % 7 === 0 ? 0.3 : 0);
    if (t === 'health') return i % 5 === 2 ? 0.4 : 0;
    return i % 9 === 0 ? 0.3 : 0;
  };
  const shade = v => {
    if (v <= 0) return 'var(--paper-3)';
    if (v < 0.3) return 'var(--loop-light)';
    if (v < 0.6) return 'var(--loop-medium)';
    return 'var(--loop-strong)';
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, marginLeft: 88, marginBottom: 6 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="nm-meta" style={{ flex: 1, fontSize: 9, textAlign: 'center', color: i % 7 === 0 ? 'var(--ink-2)' : 'transparent' }}>
            {i % 7 === 0 ? `Apr ${i + 1}` : '·'}
          </div>
        ))}
      </div>
      {triggers.map(t => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 80, fontSize: 12, textAlign: 'right' }}>{t}</div>
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} style={{
                flex: 1, aspectRatio: '1',
                background: shade(intensity(t, i)),
                borderRadius: 2,
              }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const LoopBars = () => {
  const loops = [
    { name: '"If I slow down, I\'ll fall behind."', state: 'active', occ: 9, strength: 0.78 },
    { name: '"I should already know this."', state: 'active', occ: 6, strength: 0.52 },
    { name: '"People leave when I\'m honest."', state: 'active', occ: 4, strength: 0.41 },
    { name: '"I\'m not doing enough."', state: 'resolved', occ: 11, strength: 0.22 },
    { name: '"Rest means I\'m lazy."', state: 'resolved', occ: 7, strength: 0.18 },
  ];
  return (
    <div>
      {loops.map((l, i) => (
        <div key={i} style={{ padding: '10px 0', borderBottom: i === loops.length - 1 ? 'none' : '1px dashed var(--rule)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: 'var(--ink)' }}>{l.name}</div>
            <span className={"nm-chip " + (l.state === 'resolved' ? 'sage' : 'accent')} style={{ fontSize: 10 }}>
              {l.state}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 3, background: 'var(--paper-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${l.strength * 100}%`, height: '100%', background: l.state === 'resolved' ? 'var(--sage)' : 'var(--accent)' }} />
            </div>
            <span className="nm-meta">{l.occ}× · {l.strength.toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const GrowthRow = ({ label, before, after, up, good, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)' }}>
    <div style={{ flex: 1, fontSize: 13 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', marginRight: 8 }}>{before}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>→</div>
    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, margin: '0 8px 0 10px', color: good ? 'var(--sage)' : 'var(--ink)' }}>{after}</div>
    <span style={{ fontSize: 14, color: good ? 'var(--sage)' : 'var(--accent)' }}>{up ? '↑' : '↓'}</span>
  </div>
);

Object.assign(window, { InsightsScreen });
