// Reflection thread — the core surface. Conversational, not a journal.

const ChatScreen = ({ onNav }) => {
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState([
    { from: 'nex', text: "Morning, Maya. I noticed your entry last night was about the 9pm promise again. Want to start there, or somewhere else?", meta: '07:42 · referencing 3 past threads' },
    { from: 'me', text: "Yeah, let's start there. I keep telling myself I'll stop by 9 and then I don't." },
    { from: 'nex', text: "Can I reflect something back? When this came up in February, you connected it to feeling like the work would 'slip' if you left it overnight. Does that still feel true?", quoted: { date: 'Feb 11', text: "If I don't finish tonight, tomorrow me has to carry it, and tomorrow me is already carrying too much." } },
    { from: 'me', text: "A little. But now it's more like… if I stop, I'll find out I'm not actually as needed as I think I am." },
    { from: 'nex', text: "That sounds like a different belief than the one I'd been tracking. Should I log this as a new pattern, or a variation of the old one?", choices: ['New pattern', 'Variation', 'Not sure yet'] },
  ]);

  const send = () => {
    if (!draft.trim()) return;
    setMessages(m => [...m, { from: 'me', text: draft }]);
    setDraft("");
  };

  return (
    <div className="nm-main">
      <TopBar crumb={<><button className="nm-btn ghost" onClick={() => onNav && onNav('today')} style={{ padding: '2px 6px' }}><Icon name="back" size={12} /></button><b>The 9pm promise, again</b> <span className="sep">·</span> thread #184</>}>
        <span className="nm-chip teal"><span className="nm-dot" />memory · 90d</span>
        <button className="nm-btn"><Icon name="more" size={12} /></button>
      </TopBar>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div className="nm-eyebrow" style={{ textAlign: 'center', marginBottom: 24, position: 'relative' }}>
              <span style={{ background: 'var(--surface)', padding: '0 14px', position: 'relative', zIndex: 1 }}>Today · 07:42</span>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed var(--rule)' }} />
            </div>
            {messages.map((m, i) => <Msg key={i} {...m} />)}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '16px 0', color: 'var(--ink-4)' }}>
              <ThinkingDots />
              <span className="nm-meta">Nextmate is reflecting · pulling 2 similar moments</span>
            </div>
          </div>
        </div>

        <aside style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--rule)', background: 'var(--paper)', padding: '24px 20px', overflowY: 'auto' }}>
          <div className="nm-eyebrow" style={{ marginBottom: 12 }}>Thread context</div>

          <div className="nm-card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <LoopRing strength={0.78} size={36} showLabel={false} />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontStyle: 'italic' }}>"If I slow down…"</div>
                <div className="nm-meta" style={{ fontSize: 9.5, marginTop: 2 }}>active · 0.78</div>
              </div>
            </div>
          </div>

          <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Retrieved memories</div>
          <Mem date="Feb 11" sim={0.91} text="If I don't finish tonight, tomorrow me has to carry it…" />
          <Mem date="Feb 18" sim={0.84} text="Promised myself 9pm. Worked until 11." />
          <Mem date="Apr 3" sim={0.79} text="The 'one more thing' thing again." />

          <div className="nm-hr dotted" />
          <div className="nm-eyebrow" style={{ marginBottom: 10 }}>This thread</div>
          <StatLine label="Duration" value="14 min" />
          <StatLine label="Depth" value="reflective" />
          <StatLine label="Safety" value="clear" teal />

          <div className="nm-hr dotted" />
          <div className="nm-meta" style={{ lineHeight: 1.5, color: 'var(--ink-4)' }}>
            Nextmate doesn't provide clinical advice. Safety screens run on every message.
          </div>
        </aside>
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', padding: '14px 40px', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button className="nm-btn" style={{ padding: 8 }}><Icon name="mic" /></button>
          <textarea className="nm-textarea" placeholder="Stay with the thought, or send a new one…" value={draft} onChange={e => setDraft(e.target.value)} rows={1}
            style={{ minHeight: 42, maxHeight: 140, padding: '10px 14px', fontSize: 15 }} />
          <button className="nm-btn primary" onClick={send} style={{ padding: '8px 14px' }}><Icon name="arrow" /></button>
        </div>
      </div>
    </div>
  );
};

const Msg = ({ from, text, meta, quoted, choices }) => {
  if (from === 'me') return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
      <div style={{ maxWidth: '78%', background: 'var(--ink)', color: 'var(--paper)', padding: '11px 15px', borderRadius: '14px 14px 3px 14px', fontSize: 14.5, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
  return (
    <div className="nm-fade-up" style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13 }}>N</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16.5, lineHeight: 1.55, color: 'var(--ink)', letterSpacing: '-0.005em' }}>{text}</div>
        {quoted && (
          <div style={{ marginTop: 12, padding: '11px 15px', borderLeft: '2px solid var(--accent)', background: 'var(--accent-wash)', borderRadius: '0 4px 4px 0' }}>
            <div className="nm-meta" style={{ marginBottom: 4, color: 'var(--accent-2)' }}>— {quoted.date}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, fontStyle: 'italic', color: 'var(--ink-2)' }}>"{quoted.text}"</div>
          </div>
        )}
        {choices && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {choices.map(c => <button key={c} className="nm-btn" style={{ fontSize: 12 }}>{c}</button>)}
          </div>
        )}
        {meta && <div className="nm-meta" style={{ marginTop: 6 }}>{meta}</div>}
      </div>
    </div>
  );
};

const ThinkingDots = () => (
  <div style={{ display: 'inline-flex', gap: 4 }}>
    {[0, 1, 2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', animation: `nm-blink 1.4s ${i * 0.2}s infinite ease-in-out` }} />)}
  </div>
);

const Mem = ({ date, sim, text }) => (
  <div style={{ padding: '8px 0', borderBottom: '1px dashed var(--rule)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span className="nm-meta" style={{ color: 'var(--ink-2)' }}>{date}</span>
      <span className="nm-meta">sim {sim}</span>
    </div>
    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-2)' }}>"{text}"</div>
  </div>
);

const StatLine = ({ label, value, teal }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11.5 }}>
    <span className="nm-tag">{label}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: teal ? 'var(--teal)' : 'var(--ink-2)' }}>{value}</span>
  </div>
);

Object.assign(window, { ChatScreen });
