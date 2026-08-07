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

const ThinkingDots = ({ color = 'var(--chat-bot-fg)' }) => (
  <div style={{ display: 'inline-flex', gap: 4 }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: color,
          animation: `nm-blink 1.4s ${i * 0.2}s infinite ease-in-out`,
        }}
      />
    ))}
  </div>
);

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
          background: 'linear-gradient(180deg, #2563EB 0%, #7C3AED 100%)',
          color: 'var(--paper)',
          border: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {open ? (
          <span style={{ fontSize: 22, color: '#fff', lineHeight: 1 }}>×</span>
        ) : (
          <svg width="32" height="32" viewBox="0 0 91 91" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M22.3822 35.0111C16.9268 37.0269 13.8751 43.5079 15.3854 49.8705C17.7242 59.7251 26.0478 68.4164 40.3841 75.9737C43.4239 77.5764 45.1622 78.2769 45.1622 77.9003C45.1622 77.5746 44.1123 76.1036 42.8287 74.6312C30.7205 60.7421 27.5167 56.4047 26.2971 52.2524C25.0851 48.123 25.6833 45.0071 27.9737 43.5211C30.2947 42.0157 33.4695 42.8812 38.02 46.2595C40.5606 48.1464 41.6064 48.4795 41.6064 47.4023C41.6064 45.5963 34.7589 37.7565 31.5601 35.9008C29.1271 34.4892 24.9033 34.0795 22.3822 35.0111Z" fill="white"/>
            <path d="M34.5495 23.4317C34.5495 27.5362 31.1735 30.8635 27.009 30.8635C22.8444 30.8635 19.4684 27.5362 19.4684 23.4317C19.4684 19.3273 22.8444 16 27.009 16C31.1735 16 34.5495 19.3273 34.5495 23.4317Z" fill="white"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M69.6178 35.0111C75.0732 37.0269 78.1249 43.5079 76.6146 49.8705C74.2758 59.7251 65.9522 68.4164 51.6159 75.9737C48.5761 77.5764 46.8378 78.2769 46.8378 77.9003C46.8378 77.5746 47.8877 76.1036 49.1713 74.6312C61.2795 60.7421 64.4833 56.4047 65.7029 52.2524C66.9149 48.123 66.3167 45.0071 64.0263 43.5211C61.7053 42.0157 58.5305 42.8812 53.98 46.2595C51.4394 48.1464 50.3936 48.4795 50.3936 47.4023C50.3936 45.5963 57.2411 37.7565 60.4399 35.9008C62.8729 34.4892 67.0967 34.0795 69.6178 35.0111Z" fill="white"/>
            <path d="M57.4505 23.4317C57.4505 27.5362 60.8265 30.8635 64.991 30.8635C69.1556 30.8635 72.5316 27.5362 72.5316 23.4317C72.5316 19.3273 69.1556 16 64.991 16C60.8265 16 57.4505 19.3273 57.4505 23.4317Z" fill="white"/>
          </svg>
        )}
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
            <span>Nexmate Support</span>
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
                Hi! Ask me anything about Nexmate — how it works, its features, or pricing.
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
                    background: m.role === 'user' ? 'var(--chat-user-bg)' : 'var(--chat-bot-bg)',
                    color: m.role === 'user' ? 'var(--chat-user-fg)' : 'var(--chat-bot-fg)',
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
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px 10px 10px 2px',
                    background: 'var(--chat-bot-bg)',
                  }}
                >
                  <ThinkingDots />
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--rule)', padding: 10, display: 'flex', gap: 6, flexShrink: 0 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={status === 'open' ? 'Ask about Nexmate…' : 'Connecting…'}
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