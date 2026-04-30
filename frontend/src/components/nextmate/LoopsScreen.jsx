import { useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';

const LoopItem = ({ loop, active, onClick }) => (
  <div onClick={onClick} style={{ padding: '10px 12px', borderRadius: 4, cursor: 'pointer', marginBottom: 1, background: active ? 'var(--surface)' : 'transparent', borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LoopRing strength={loop.strength} size={30} showLabel={false} resolved={loop.state === 'resolved'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontStyle: 'italic', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{loop.quote}"</div>
        <div className="nm-meta" style={{ fontSize: 9.5, marginTop: 2 }}>{loop.occ}× · {loop.triggers.join(', ')}</div>
      </div>
    </div>
  </div>
);

const Constellation = ({ occ, resolved }) => {
  const w = 700, h = 240, cx = w / 2, cy = h / 2;
  const rng = i => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const color = resolved ? 'var(--teal)' : 'var(--accent)';
  const nodes = Array.from({ length: occ }, (_, i) => {
    const a = (i / occ) * Math.PI * 2 + rng(i) * 0.5;
    const r = 55 + rng(i + 5) * 75;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.65 };
  });
  nodes[0] = { x: cx + 95, y: cy - 25 };
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', background: resolved ? 'var(--teal-soft)' : 'var(--accent-wash)' }}>
      {nodes.map((n, i) => nodes.slice(i + 1).map((m, j) => {
        const d = Math.hypot(n.x - m.x, n.y - m.y);
        if (d > 140) return null;
        return <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke={color} strokeWidth="1" opacity={Math.max(0, 1 - d / 140) * 0.4} />;
      }))}
      <circle cx={cx} cy={cy} r="24" fill="none" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <text x={cx} y={cy + 42} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="0.14em">CORE BELIEF</text>
      {nodes.map((n, i) => (
        <g key={i}>
          {i === 0 && <circle cx={n.x} cy={n.y} r="13" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />}
          <circle cx={n.x} cy={n.y} r={i === 0 ? 7 : 5} fill="var(--surface)" stroke={color} strokeWidth={i === 0 ? 2 : 1.2} />
        </g>
      ))}
      <text x={nodes[0].x + 14} y={nodes[0].y + 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink)">Apr 22 · latest</text>
    </svg>
  );
};

const StatCell = ({ label, value, sub, accent }) => (
  <div className="nm-card" style={{ padding: 16 }}>
    <div className="nm-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1, color: accent ? 'var(--accent)' : 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</div>
    {sub && <div className="nm-meta" style={{ marginTop: 6 }}>{sub}</div>}
  </div>
);

const FRow = ({ label, items, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)', gap: 12 }}>
    <div className="nm-tag" style={{ width: 120 }}>{label}</div>
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {items.map(i => <span key={i} className="nm-chip">{i}</span>)}
    </div>
  </div>
);

const Occ = ({ date, text, sim, i, first, last }) => (
  <div style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)' }}>
    <div style={{ width: 110, flexShrink: 0 }}>
      <div className="nm-meta" style={{ color: 'var(--ink-2)' }}>{date}</div>
      {first && <div className="nm-meta" style={{ fontSize: 9, color: 'var(--accent)' }}>first</div>}
    </div>
    <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-serif)', fontSize: 14, lineHeight: 1.45 }}>"{text}"</div>
    <div style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
      <div className="nm-meta">sim {sim.toFixed(2)} · i{i}</div>
      <div style={{ height: 2, background: 'var(--rule-soft)', marginTop: 4, borderRadius: 1 }}>
        <div style={{ width: `${sim * 100}%`, height: '100%', background: 'var(--accent)', marginLeft: 'auto' }} />
      </div>
    </div>
  </div>
);

export const LoopsScreen = () => {
  const [selected, setSelected] = useState(0);
  const loops = [
    { quote: "If I slow down, I'll fall behind.", state: 'active', strength: 0.78, occ: 9, first: 'Feb 11', last: 'Apr 22', triggers: ['work', 'sleep'], emotion: 'overwhelm', avgI: 7.2 },
    { quote: "I should already know this.", state: 'active', strength: 0.52, occ: 6, first: 'Mar 3', last: 'Apr 18', triggers: ['work'], emotion: 'shame', avgI: 6.5 },
    { quote: "People leave when I'm honest.", state: 'active', strength: 0.41, occ: 4, first: 'Mar 22', last: 'Apr 15', triggers: ['friendship'], emotion: 'anxious', avgI: 7.0 },
    { quote: "I'm not doing enough.", state: 'resolved', strength: 0.22, occ: 11, first: 'Nov 4', last: 'Mar 28', triggers: ['work'], emotion: 'guilt', avgI: 6.0 },
    { quote: "Rest means I'm lazy.", state: 'resolved', strength: 0.18, occ: 7, first: 'Dec 12', last: 'Mar 2', triggers: ['health'], emotion: 'guilt', avgI: 5.8 },
  ];
  const loop = loops[selected];

  return (
    <div className="nm-main">
      <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Loops</b></>}>
        <button className="nm-btn"><Icon name="search" size={12} /> Filter</button>
        <button className="nm-btn"><Icon name="download" size={12} /> Export</button>
      </TopBar>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--rule)', overflowY: 'auto', background: 'var(--paper)' }}>
          <div style={{ padding: '26px 22px 14px' }}>
            <div className="nm-eyebrow" style={{ marginBottom: 8 }}>Pattern library</div>
            <div className="nm-h2">12 loops tracked</div>
            <div className="nm-meta" style={{ marginTop: 4 }}>3 active · 2 resolved · 7 candidate</div>
          </div>
          <div style={{ padding: '0 12px 24px' }}>
            <div className="nm-eyebrow" style={{ padding: '10px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />Active</div>
            {loops.map((l, i) => l.state === 'active' && <LoopItem key={i} loop={l} active={selected === i} onClick={() => setSelected(i)} />)}
            <div className="nm-eyebrow" style={{ padding: '14px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)' }} />Resolved</div>
            {loops.map((l, i) => l.state === 'resolved' && <LoopItem key={i} loop={l} active={selected === i} onClick={() => setSelected(i)} />)}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 44px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span className={"nm-chip " + (loop.state === 'resolved' ? 'teal' : 'accent')}><span className="nm-dot" />{loop.state}</span>
              <span className="nm-tag">first seen {loop.first} · last {loop.last}</span>
            </div>

            <h1 className="nm-h1" style={{ marginBottom: 28, fontStyle: 'italic', color: loop.state === 'resolved' ? 'var(--ink-3)' : 'var(--ink)' }}>
              "{loop.quote}"
            </h1>

            <div className="nm-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '18px 22px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div className="nm-eyebrow">Constellation</div>
                  <div className="nm-h3" style={{ marginTop: 4 }}>{loop.occ} occurrences around a core belief</div>
                </div>
                <div className="nm-meta">threshold 0.72 · cosine</div>
              </div>
              <Constellation occ={loop.occ} resolved={loop.state === 'resolved'} />
            </div>

            <div className="nm-grid-4" style={{ marginBottom: 16 }}>
              <StatCell label="Strength" value={loop.strength.toFixed(2)} accent={loop.state !== 'resolved'} />
              <StatCell label="Occurrences" value={loop.occ} />
              <StatCell label="Avg intensity" value={loop.avgI} />
              <StatCell label="Span" value="72d" sub={`${loop.first} → ${loop.last}`} />
            </div>

            <div className="nm-card" style={{ marginBottom: 16 }}>
              <div className="nm-eyebrow" style={{ marginBottom: 14 }}>Extracted features</div>
              <FRow label="Triggers" items={loop.triggers} />
              <FRow label="Emotion" items={[loop.emotion]} />
              <FRow label="Valence" items={['negative']} />
              <FRow label="Co-occurs with" items={['late night', 'solo', 'work']} last />
            </div>

            <div className="nm-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div className="nm-eyebrow">Every time it showed up</div>
                <div className="nm-meta">{loop.occ} moments</div>
              </div>
              <Occ date="Apr 22 · 22:14" text="Couldn't sleep again. Told myself one more hour…" sim={0.91} i={7} />
              <Occ date="Apr 20 · 09:10" text="I keep thinking if I slow down, everything falls apart." sim={0.94} i={8} />
              <Occ date="Apr 15 · 21:08" text="Can't shake the feeling I'm already behind." sim={0.86} i={7} />
              <Occ date="Apr 8 · 22:56" text="If I stop now, Monday me inherits all of it." sim={0.88} i={9} />
              <Occ date="Apr 3 · 23:12" text="The 'one more thing' thing again." sim={0.82} i={7} />
              <Occ date="Feb 11 · 22:30" text="If I don't finish tonight, tomorrow me has to carry it." sim={1.00} i={8} first last />
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 22 }}>
              <button className="nm-btn accent"><Icon name="plus" size={12} /> Reflect on this loop</button>
              <button className="nm-btn">Mark resolved</button>
              <button className="nm-btn ghost">Rename</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};