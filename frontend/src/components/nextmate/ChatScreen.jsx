import { useEffect, useRef, useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';
import { useChatSocket } from '../../hooks/useChatSocket';
import { getThreadMessages } from '../../lib/api';

const Msg = ({ from, text, meta, quoted, choices }) => {
  if (from === 'me') return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
      <div style={{ maxWidth: '78%', background: 'var(--ink)', color: 'var(--paper)', padding: '11px 15px', borderRadius: '14px 14px 3px 14px', fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  );
  return (
    <div className="nm-fade-up" style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13 }}>N</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16.5, lineHeight: 1.55, color: 'var(--ink)', letterSpacing: '-0.005em', whiteSpace: 'pre-wrap' }}>{text}</div>
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

const StatLine = ({ label, value, teal }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11.5 }}>
    <span className="nm-tag">{label}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: teal ? 'var(--teal)' : 'var(--ink-2)' }}>{value}</span>
  </div>
);

export const ChatScreen = ({ onNav, threadId, threadTitle, onMessageDone }) => {
  const [draft, setDraft] = useState('');
  const { messages, streaming, status, error, send, loadHistory } = useChatSocket(threadId, { onDone: onMessageDone });
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!threadId) return;
    let off = false;
    getThreadMessages(threadId)
      .then((data) => { if (!off) loadHistory(data.messages); })
      .catch(() => {});
    return () => { off = true; };
  }, [threadId, loadHistory]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const submit = () => {
    const text = draft.trim();
    if (!text || streaming || status !== 'open') return;
    if (send(text)) setDraft('');
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="nm-main">
      <TopBar crumb={<><button className="nm-btn ghost" onClick={() => onNav && onNav('today')} style={{ padding: '2px 6px' }}><Icon name="back" size={12} /></button><b>{threadTitle || 'Reflection'}</b> <span className="sep">·</span> {threadId ? `thread ${threadId.slice(0, 8)}` : 'new'}</>}>
        <span className="nm-chip teal"><span className="nm-dot" />{status === 'open' ? 'live' : status}</span>
        <button className="nm-btn"><Icon name="more" size={12} /></button>
      </TopBar>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div className="nm-eyebrow" style={{ textAlign: 'center', marginBottom: 24, position: 'relative' }}>
              <span style={{ background: 'var(--surface)', padding: '0 14px', position: 'relative', zIndex: 1 }}>
                {threadId ? 'Conversation' : 'No thread selected'}
              </span>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed var(--rule)' }} />
            </div>
            {messages.map((m, i) => <Msg key={i} {...m} />)}
            {streaming && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '16px 0', color: 'var(--ink-4)' }}>
                <ThinkingDots />
                <span className="nm-meta">Nextmate is reflecting…</span>
              </div>
            )}
            {error && (
              <div className="nm-body" style={{ color: 'var(--accent)', fontSize: 12 }}>{error}</div>
            )}
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

          <div className="nm-hr dotted" />
          <div className="nm-eyebrow" style={{ marginBottom: 10 }}>This thread</div>
          <StatLine label="Messages" value={messages.length} />
          <StatLine label="Connection" value={status} teal={status === 'open'} />

          <div className="nm-hr dotted" />
          <div className="nm-meta" style={{ lineHeight: 1.5, color: 'var(--ink-4)' }}>
            Nextmate doesn't provide clinical advice. Safety screens run on every message.
          </div>
        </aside>
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', padding: '14px 40px', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button className="nm-btn" style={{ padding: 8 }}><Icon name="mic" /></button>
          <textarea
            className="nm-textarea"
            placeholder={threadId ? 'Stay with the thought, or send a new one…' : 'Start a new reflection from the sidebar.'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={!threadId}
            style={{ minHeight: 42, maxHeight: 140, padding: '10px 14px', fontSize: 15 }}
          />
          <button className="nm-btn primary" onClick={submit} disabled={!threadId || streaming || status !== 'open'} style={{ padding: '8px 14px' }}>
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </div>
  );
};