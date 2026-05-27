import { useEffect, useRef, useState, useCallback } from 'react';
import { chatSocketUrl } from '../lib/api';

export function useChatSocket(threadId, { onDone, onChunk, context } = {}) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const streamingIdxRef = useRef(null);
  const onDoneRef = useRef(onDone);
  const onChunkRef = useRef(onChunk);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

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
      return () => {};
    }

    const ws = new WebSocket(chatSocketUrl(threadId));
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
    };

    ws.onclose = () => {
      setStatus('closed');
      setStreaming(false);
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
      } else if (data.event === 'error') {
        setStreaming(false);
        setError(data.detail || 'Chat error');
      }
    };

    return () => {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [threadId, context]);

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