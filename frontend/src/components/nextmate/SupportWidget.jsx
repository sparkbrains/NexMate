import { useEffect, useRef, useState } from 'react';
import { getToken } from '../../lib/api';

const WS_BASE = (() => {
  const apiBase = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  return apiBase.replace(/^http/, 'ws');
})();

const buildSupportWsUrl = () => {
  const token = getToken();
  const url = `${WS_BASE}/api/support/ws`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
};

// higher = faster
const REVEAL_INTERVAL_MS = 18;
const REVEAL_CHARS_PER_TICK = 2;

export const SupportWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [waitingFirstChunk, setWaitingFirstChunk] = useState(false);
  const [status, setStatus] = useState('idle');

  const wsRef = useRef(null);
  const streamingIndexRef = useRef(null);
  const scrollRef = useRef(null);

  // Reveal-buffer state: text received from the socket but not yet shown,
  // drained a couple characters at a time on revealTimerRef's interval.
  // doneReceivedRef marks that the socket said "done" -- the timer keeps
  // draining any remaining buffered text after that before it actually
  // stops, so the tail of a fast/final chunk still animates smoothly
  // instead of snapping in all at once.
  const pendingBufferRef = useRef('');
  const doneReceivedRef = useRef(false);
  const revealTimerRef = useRef(null);

  const stopRevealTimer = () => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  const startRevealTimer = () => {
    if (revealTimerRef.current) return;
    revealTimerRef.current = setInterval(() => {
      if (!pendingBufferRef.current) {
        if (doneReceivedRef.current) {
          stopRevealTimer();
          setStreaming(false);
          streamingIndexRef.current = null;
        }
        return;
      }

      const nextChars = pendingBufferRef.current.slice(0, REVEAL_CHARS_PER_TICK);
      pendingBufferRef.current = pendingBufferRef.current.slice(REVEAL_CHARS_PER_TICK);

      setMessages((prev) => {
        const next = [...prev];
        const idx = streamingIndexRef.current;
        if (idx === null || !next[idx] || next[idx].role !== 'assistant') {
          next.push({ role: 'assistant', content: nextChars });
          streamingIndexRef.current = next.length - 1;
        } else {
          next[idx] = { ...next[idx], content: next[idx].content + nextChars };
        }
        return next;
      });
      setWaitingFirstChunk(false);
    }, REVEAL_INTERVAL_MS);
  };

  const connect = () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    setStatus('connecting');
    const socket = new WebSocket(buildSupportWsUrl());
    wsRef.current = socket;

    socket.onopen = () => setStatus('open');
    socket.onclose = () => setStatus('closed');
    socket.onerror = () => setStatus('closed');

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'chunk') {
        pendingBufferRef.current += data.content || '';
        startRevealTimer();
      } else if (data.type === 'done') {
        // Don't flip streaming off immediately -- let the reveal timer
        // finish draining pendingBufferRef first so the last words don't
        // snap in ahead of the typewriter pace.
        doneReceivedRef.current = true;
      } else if (data.type === 'error') {
        stopRevealTimer();
        pendingBufferRef.current = '';
        doneReceivedRef.current = false;
        streamingIndexRef.current = null;
        setStreaming(false);
        setWaitingFirstChunk(false);
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message || 'Something went wrong.' }]);
      }
    };
  };

  // Connect lazily on first open, not on mount -- most visitors will never
  // click the widget, so don't hold a socket open for everyone by default.
  useEffect(() => {
    if (open) connect();
  }, [open]);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      stopRevealTimer();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = () => {
    const text = draft.trim();
    if (!text || status !== 'open') return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setStreaming(true);
    setWaitingFirstChunk(true);
    pendingBufferRef.current = '';
    doneReceivedRef.current = false;
    streamingIndexRef.current = null;
    wsRef.current.send(JSON.stringify({ content: text }));
    setDraft('');
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Chat with support"
        aria-label="Chat with support"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--ink)',
          color: 'var(--paper)',
          border: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontFamily: 'var(--font-display)',
          zIndex: 9999,
        }}
      >
        {open ? '×' : '?'}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 92,
            right: 24,
            width: 340,
            height: 460,
            background: 'var(--surface)',
            border: '1px solid var(--rule)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--rule)',
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'var(--ink)',
              flexShrink: 0,
            }}
          >
            <span>Nextmate Support</span>
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: status === 'open' ? 'var(--teal)' : 'var(--ink-4)',
              }}
            >
              {status === 'open' ? 'online' : status === 'connecting' ? 'connecting…' : 'offline'}
            </span>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-4)', lineHeight: 1.5 }}>
                Hi! Ask me anything about Nextmate — how it works, its features, or pricing.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: m.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                    background: m.role === 'user' ? 'var(--ink)' : 'var(--accent-wash)',
                    color: m.role === 'user' ? 'var(--paper)' : 'var(--ink)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {waitingFirstChunk && (
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>thinking…</div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--rule)', padding: 10, display: 'flex', gap: 6, flexShrink: 0 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={status === 'open' ? 'Ask about Nextmate…' : 'Connecting…'}
              disabled={status !== 'open'}
              style={{
                flex: 1,
                fontSize: 13,
                padding: '8px 10px',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                background: 'var(--paper)',
                color: 'var(--ink)',
              }}
            />
            <button
              onClick={send}
              disabled={status !== 'open' || !draft.trim()}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
};