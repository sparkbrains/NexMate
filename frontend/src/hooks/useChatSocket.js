import { useEffect, useRef, useState, useCallback } from 'react';
import { chatSocketUrl, clearSession, createWsTicket } from '../lib/api';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export function useChatSocket(threadId, { onDone, onChunk, context, onAuthExpired } = {}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const streamingIdxRef = useRef(null);
  const onDoneRef = useRef(onDone);
  const onChunkRef = useRef(onChunk);
  const onAuthExpiredRef = useRef(onAuthExpired);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  useEffect(() => {
    onAuthExpiredRef.current = onAuthExpired;
  }, [onAuthExpired]);

  useEffect(() => {
    if (!threadId) return;

    setMessages([]);
    streamingIdxRef.current = null;
    setError(null);
    setStatus('connecting');

    // If context is provided, load it immediately instead of starting fresh
    if (context && context.length > 0) {
      setMessages(context.map(msg => ({
        from: msg.role,
        text: msg.content,
        meta: msg.created_at ? new Date(msg.created_at).toLocaleDateString() : null,
      })));
      setStatus('connected');
      return () => { };
    }

    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer = null;

    const scheduleReconnect = () => {
      if (cancelled) return;
      setStatus('reconnecting');
      const backoff = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS);
      const jitter = backoff * 0.2 * Math.random();
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        if (!cancelled) connect();
      }, backoff + jitter);
    };

    const connect = async () => {
      let ticket;
      try {
        const data = await createWsTicket();
        ticket = data.ticket;
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          setError('Your session expired. Please log in again.');
          clearSession();
          if (onAuthExpiredRef.current) onAuthExpiredRef.current();
          setStatus('closed');
          return;
        }
        // Couldn't reach the server to mint a ticket -- treat it the same
        // as a dropped connection and retry with backoff.
        scheduleReconnect();
        return;
      }
      if (cancelled) return;

      const ws = new WebSocket(chatSocketUrl(threadId, ticket));
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        reconnectAttempt = 0;
        setStatus('open');
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (cancelled) return;
        // 4401 is the backend's dedicated close code for an auth rejection
        // (see apps/api/routers/ws.py) -- distinct from a normal close, a
        // network drop, or the server restarting. Without checking this,
        // an expired/invalidated session and an ordinary disconnect look
        // identical to the user: chat just silently stops responding.
        if (event.code === 4401) {
          setError('Your session expired. Please log in again.');
          clearSession();
          if (onAuthExpiredRef.current) onAuthExpiredRef.current();
          setStatus('closed');
          setStreaming(false);
          return;
        }
        // 4408 is the backend's dedicated close code for an idle timeout
        // (see WS_IDLE_TIMEOUT_SECONDS in apps/api/routers/ws.py) -- the
        // server deliberately dropped a socket that's had no messages in a
        // while, rather than a crash or network drop. Auto-reconnecting
        // would just immediately reopen the same still-idle connection, so
        // this waits for the user to actually come back and refresh
        // instead of retrying in the background.
        if (event.code === 4408) {
          setStatus('timed-out');
          setStreaming(false);
          return;
        }
        setStreaming(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        setError('Connection error');
      };

      ws.onmessage = (ev) => {
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (data.event === 'start') {
          setStreaming(true);
          setMessages((m) => [...m, { from: 'nex', text: '' }]);
        } else if (data.event === 'error') {
          setStreaming(false);
          setError(data.message || data.detail || 'Chat error');
        } else if (data.event === 'chunk') {
          setMessages((m) => {
            if (m.length === 0) return m;
            const next = m.slice();
            const i = next.length - 1;
            if (next[i].from === 'nex') {
              next[i] = { ...next[i], text: (next[i].text || '') + (data.delta || '') };
            }
            return next;
          });
          if (onChunkRef.current) onChunkRef.current(data.delta);
        } else if (data.event === 'done') {
          setStreaming(false);
          setMessages((m) => {
            if (m.length === 0) return m;
            const next = m.slice();
            const i = next.length - 1;
            if (next[i].from === 'nex') {
              next[i] = {
                ...next[i],
                text: data.content ?? next[i].text,
                meta: data.summary?.note,
              };
            }
            return next;
          });
          if (onDoneRef.current) onDoneRef.current(data);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
      ) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [threadId, context]);

  const send = useCallback((text) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    setError(null);
    setMessages((m) => [...m, { from: 'me', text }]);
    ws.send(JSON.stringify({ message: text }));
    return true;
  }, []);

  const loadHistory = useCallback((history) => {
    const mapped = (history || [])
      .map((row) => ({
        from: row.role === 'user' ? 'me' : 'nex',
        text: row.content,
      }))
      .filter((m) => m.text);

    setMessages(mapped);
  }, []);

  return { messages, streaming, status, error, send, loadHistory };
}
