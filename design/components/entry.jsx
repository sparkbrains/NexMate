// New Entry Composer — focused writing with real-time feature preview

const EntryScreen = () => {
  const [text, setText] = React.useState("I told myself I'd stop at 9pm tonight. It's 11:40 now, and I'm still sitting here running through what Priya said in the meeting. I keep replaying the moment she asked whether we could ship sooner. I said yes. I always say yes. And now I'm sitting here trying to make 'yes' real, and I'm tired, and a part of me thinks if I just push through tonight I'll be okay tomorrow.");
  const [saved, setSaved] = React.useState(true);

  return (
    <div className="nm-main">
      <TopBar crumb={<>Daily · <b>New entry</b> · Apr 23, 2026</>}>
        <span className="nm-meta">{saved ? '✓ auto-saved' : 'saving…'}</span>
        <button className="nm-btn">Discard</button>
        <button className="nm-btn primary">Reflect with NexMate <Icon name="arrow" /></button>
      </TopBar>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Composer */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '48px 60px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div className="nm-eyebrow" style={{ marginBottom: 14 }}>Thursday, April 23 · 07:42 · entry #248</div>
            <div className="nm-h1" style={{ marginBottom: 24, color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 24 }}>
              What's on your mind?
            </div>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setSaved(false); setTimeout(() => setSaved(true), 600); }}
              autoFocus
              placeholder="Start anywhere."
              style={{
                width: '100%', minHeight: 320, border: 'none', outline: 'none',
                background: 'transparent', resize: 'none',
                fontFamily: 'var(--font-serif)', fontSize: 19, lineHeight: 1.65,
                color: 'var(--ink)',
              }}
            />

            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="nm-btn"><Icon name="mic" /> Voice</button>
              <button className="nm-btn"><Icon name="plus" /> Prompt</button>
              <span className="nm-meta" style={{ marginLeft: 'auto' }}>
                {text.split(/\s+/).filter(Boolean).length} words · est. 42s read
              </span>
            </div>

            <div className="nm-hr dotted" style={{ margin: '36px 0' }} />

            {/* Safety check */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', background: 'var(--paper-2)', borderRadius: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sage)' }} />
              <span className="nm-meta" style={{ color: 'var(--ink-2)' }}>Safety check · clear · rule-based screen + embedding flag</span>
            </div>
          </div>
        </div>

        {/* Live preview */}
        <aside style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--rule)', background: 'var(--paper-2)', padding: '24px 22px', overflowY: 'auto' }}>
          <div className="nm-eyebrow" style={{ marginBottom: 4 }}>As you write</div>
          <div className="nm-h3" style={{ marginBottom: 20, fontWeight: 400, fontSize: 14, color: 'var(--ink-3)' }}>
            NexMate is reading ambiently. Nothing is saved until you submit.
          </div>

          <Extracted label="Triggers" items={[['work', 0.92], ['sleep', 0.71]]} />
          <Extracted label="Emotion" items={[['overwhelm', 0.68], ['tired', 0.54]]} />
          <Extracted label="Valence" items={[['negative', 0.81]]} single />

          <div className="nm-hr" />

          <div className="nm-eyebrow" style={{ marginBottom: 8 }}>Intensity</div>
          <IntensityMeter value={7} />

          <div className="nm-hr" />

          <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Similar to</div>
          <SimilarEntry date="Apr 21 · 23:40" sim={0.89} text="Told myself I'd stop at 9pm. It's 11:40." />
          <SimilarEntry date="Feb 18 · 23:44" sim={0.84} text="Promised 9pm. Worked until 11." />

          <div className="nm-hr" />

          <div style={{ padding: '10px 12px', background: 'var(--paper)', border: '1px solid var(--clay)', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <LoopRing strength={0.78} size={30} showLabel={false} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>Matches active loop</div>
                <div className="nm-meta" style={{ fontSize: 10 }}>"If I slow down, I'll fall behind."</div>
              </div>
            </div>
            <div className="nm-meta" style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              3 similar neighbors above 0.72 threshold. Submitting will add this as the 10th occurrence.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const Extracted = ({ label, items, single }) => (
  <div style={{ marginBottom: 16 }}>
    <div className="nm-tag" style={{ marginBottom: 6 }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(([name, conf]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={"nm-chip " + (single ? 'accent' : '')} style={{ fontSize: 11 }}>{name}</span>
          <div style={{ flex: 1, height: 2, background: 'var(--paper-3)', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{ width: `${conf * 100}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <span className="nm-meta" style={{ fontSize: 10 }}>{conf.toFixed(2)}</span>
        </div>
      ))}
    </div>
  </div>
);

const IntensityMeter = ({ value }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: 1 }}>{value}</span>
      <span className="nm-meta">/ 10</span>
    </div>
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 6,
          background: i < value ? (i >= 6 ? 'var(--accent)' : 'var(--clay)') : 'var(--paper-3)',
          borderRadius: 1,
        }} />
      ))}
    </div>
  </div>
);

const SimilarEntry = ({ date, sim, text }) => (
  <div style={{ padding: '8px 0', borderBottom: '1px dashed var(--rule)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span className="nm-meta" style={{ color: 'var(--ink-2)' }}>{date}</span>
      <span className="nm-meta">sim {sim.toFixed(2)}</span>
    </div>
    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-2)' }}>"{text}"</div>
  </div>
);

Object.assign(window, { EntryScreen });
