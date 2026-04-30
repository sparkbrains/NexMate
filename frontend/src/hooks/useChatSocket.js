import { useEffect, useRef, useState, useCallback } from 'react';
import { chatSocketUrl } from '../lib/api';

export function useChatSocket(threadId, { onDone } = {}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const streamingIdxRef = useRef(null);

  useEffect(() => {
    if (!threadId) return;
    setMessages([]);
    streamingIdxRef.current = null;
    setError(null);
    setStatus('connecting');

    const ws = new WebSocket(chatSocketUrl(threadId));
    wsRef.current = ws;

    ws.onopen = () => setStatus('open');
    ws.onclose = () => setStatus('closed');
    ws.onerror = () => setError('Connection error');
    ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data.event === 'start') {
        setStreaming(true);
        setMessages((m) => {
          streamingIdxRef.current = m.length;
          return [...m, { from: 'nex', text: '' }];
        });
      } else if (data.event === 'chunk') {
        setMessages((m) => {
          const i = streamingIdxRef.current;
          if (i == null) return m;
          const next = m.slice();
          next[i] = { ...next[i], text: (next[i].text || '') + (data.delta || '') };
          return next;
        });
      } else if (data.event === 'done') {
        setStreaming(false);
        setMessages((m) => {
          const i = streamingIdxRef.current;
          if (i == null) return m;
          const next = m.slice();
          next[i] = { ...next[i], text: data.content ?? next[i].text, meta: data.summary?.note };
          return next;
        });
        streamingIdxRef.current = null;
        if (onDone) onDone(data);
      } else if (data.event === 'error') {
        setStreaming(false);
        setError(data.detail || 'Chat error');
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [threadId, onDone]);

  const send = useCallback((text) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
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