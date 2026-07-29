import { useEffect, useRef, useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';
import { useChatSocket } from '../../hooks/useChatSocket';
import {
  getThreadMessages,
  listLoops,
  getThreadSummary,
  transcribeAudio,
  finalizeThreadSummary,
  listJournalBooks,
  createJournalBook,
  createJournalEntry,
  saveThreadSummaryAsJournalEntry
} from '../../lib/api';

const NEW_BOOK_OPTION = '__new__';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const Msg = ({ from, text, meta, quoted, choices, className }) => {
  const containerStyle = {
    display: from === 'me' ? 'flex' : 'flex',
    justifyContent: from === 'me' ? 'flex-end' : 'flex-start',
    marginBottom: from === 'me' ? 16 : 22,
    gap: from === 'me' ? undefined : 12,
    ...(className ? {} : {}),
  };

  if (from === 'me') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }} className={className}>
        <div
          style={{
            maxWidth: '78%',
            background: 'var(--ink)',
            color: 'var(--paper)',
            padding: '11px 15px',
            borderRadius: '14px 14px 3px 14px',
            fontSize: 14.5,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className={`nm-fade-up ${className || ''}`} style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          color: '#fff',
          fontFamily: 'var(--font-display)',
          fontSize: 13,
        }}
      >
        N
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 16.5,
            lineHeight: 1.55,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </div>
        {quoted && (
          <div
            style={{
              marginTop: 12,
              padding: '11px 15px',
              borderLeft: '2px solid var(--accent)',
              background: 'var(--accent-wash)',
              borderRadius: '0 4px 4px 0',
            }}
          >
            <div className="nm-meta" style={{ marginBottom: 4, color: 'var(--accent-2)' }}>
              — {quoted.date}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 13.5,
                fontStyle: 'italic',
                color: 'var(--ink-2)',
              }}
            >
              "{quoted.text}"
            </div>
          </div>
        )}
        {choices && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {choices.map((c) => (
              <button key={c} className="nm-btn" style={{ fontSize: 12 }}>
                {c}
              </button>
            ))}
          </div>
        )}
        {meta && <div className="nm-meta" style={{ marginTop: 6 }}>{meta}</div>}
      </div>
    </div>
  );
};

const ThinkingDots = () => (
  <div style={{ display: 'inline-flex', gap: 4 }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'var(--accent)',
          animation: `nm-blink 1.4s ${i * 0.2}s infinite ease-in-out`,
        }}
      />
    ))}
  </div>
);

const StatLine = ({ label, value, teal }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11.5 }}>
    <span className="nm-tag">{label}</span>
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: teal ? 'var(--teal)' : 'var(--ink-2)',
      }}
    >
      {value}
    </span>
  </div>
);

export const ChatScreen = ({
  onNav,
  threadId,
  threadTitle,
  onMessageDone,
  context,
  initialMessage,
  onAuthExpired,
}) => {
  const [draft, setDraft] = useState('');
  const [loops, setLoops] = useState([]);
  const [threadSummary, setThreadSummary] = useState(null);
  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceDebug, setVoiceDebug] = useState('');
  const [audioSupported, setAudioSupported] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(null);
  const [currentVoiceLog, setCurrentVoiceLog] = useState(null);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [voiceGender, setVoiceGender] = useState('female'); // 'female' | 'male' | 'custom'
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [showSidePanel, setShowSidePanel] = useState(true);

  const [showSaveToJournal, setShowSaveToJournal] = useState(false);
  const [loadingJournalBooks, setLoadingJournalBooks] = useState(false);
  const [journalBooks, setJournalBooks] = useState([]);
  const [journalTargetBookId, setJournalTargetBookId] = useState('');
  const [newJournalBookName, setNewJournalBookName] = useState('');
  const [savingToJournal, setSavingToJournal] = useState(false);
  const [journalSaveMessage, setJournalSaveMessage] = useState('');
  const [journalSaveError, setJournalSaveError] = useState(false);

  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const voiceBaseRef = useRef('');
  const voiceFinalRef = useRef('');
  const voiceInterimRef = useRef('');
  const scrollRef = useRef(null);
  const unspokenTextRef = useRef('');


  const { messages, streaming, status, error, send, loadHistory } = useChatSocket(threadId, {
    onChunk: (delta) => {
      if (!voiceOutputEnabled) return;
      if (delta) {
        unspokenTextRef.current += delta;
        // Extract all complete sentences from the buffer
        while (true) {
          const match = unspokenTextRef.current.match(/([.!?]+[\s\n]+)/);
          if (!match) break;
          
          const index = match.index + match[0].length;
          const sentence = unspokenTextRef.current.slice(0, index).trim();
          unspokenTextRef.current = unspokenTextRef.current.slice(index);
          
          if (sentence) {
            speakText(sentence, false);
          }
        }
      }
    },
    onDone: (msg) => {
      if (msg.role === 'assistant' && voiceOutputEnabled) {
        const remainder = unspokenTextRef.current.trim();
        if (remainder) {
          speakText(remainder, false);
        }
        unspokenTextRef.current = '';
      }
      if (onMessageDone) onMessageDone();
    },
    context,
    onAuthExpired,
  });

  // Load available voices (browser voices load asynchronously)
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      setAvailableVoices(voices);
    };
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);



  const speakText = (text, cancelPrevious = true) => {
    if (!window.speechSynthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    if (cancelPrevious) {
      window.speechSynthesis.cancel(); // stop any ongoing speech
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    let voice = null;
        // Select voice based on gender without hard‑coded names
    const getVoiceByGender = (gender) => {
      // Detect platform via userAgent
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isWindows = ua.includes('Windows');
      const isMac = ua.includes('Mac');

      // Platform‑specific preferred voice names
      const platformPreferred = [];
      if (isWindows) {
        if (gender === 'female') platformPreferred.push('Zira', 'Microsoft Zira Desktop');
        if (gender === 'male') platformPreferred.push('David', 'Microsoft David Desktop');
      } else if (isMac) {
        if (gender === 'female') platformPreferred.push('Samantha');
        if (gender === 'male') platformPreferred.push('Alex');
      }

      // Try platform‑specific names first
      for (const name of platformPreferred) {
        const v = voices.find((v) => v.name && v.name.includes(name));
        if (v) return v;
      }

      const genderKey = gender.toLowerCase();
      const matched = voices.filter((v) => v.name && v.name.toLowerCase().includes(genderKey));
      const enMatched = matched.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      if (enMatched.length) return enMatched[0];
      if (matched.length) return matched[0];

      const enVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      return enVoices[0] || voices.find((v) => v.default) || null;
    };

    if (voiceGender === 'custom' && selectedVoiceName) {
      // Use the explicitly chosen voice
      voice = voices.find((v) => v.name === selectedVoiceName) || null;
    } else {
      // Dynamically pick a voice based on gender
      voice = getVoiceByGender(voiceGender);
    }

    utterance.voice = voice || voices.find((v) => v.default) || null;
    utterance.lang = 'en-US';
    utterance.rate = 0.80;
    utterance.pitch = 0.95;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  };

  const VOICE_LOG_KEY = 'nextmate_voice_logs';

  const loadVoiceLogs = () => {
    try {
      const raw = window.localStorage.getItem(VOICE_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        setCurrentVoiceLog(parsed);
      }
    } catch {
      setCurrentVoiceLog(null);
    }
  };

  const persistVoiceLog = (log) => {
    try {
      window.localStorage.setItem(VOICE_LOG_KEY, JSON.stringify(log));
    } catch {
      // ignore storage failures
    }
    setCurrentVoiceLog(log);
  };

  const appendVoiceLog = (entry) => {
    persistVoiceLog(entry);
    setVoiceRecording(entry);
  };

  const blobToDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  useEffect(() => {
    setAudioSupported(Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
    setSpeechSupported(true);
    loadVoiceLogs();
    return () => {
      const stream = mediaStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
  }, []);

  const stopVoice = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setRecording(false);
  };

  const startVoice = async () => {
    if (!audioSupported) {
      setVoiceError('Audio recording is not supported in this browser.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setVoiceError('Voice input requires internet access. Please reconnect and try again.');
      return;
    }

    voiceBaseRef.current = draft.trim();
    voiceFinalRef.current = '';
    voiceInterimRef.current = '';
    setVoiceError('');
    setRecording(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
    } catch (err) {
      setVoiceError('Microphone access denied or unavailable.');
      setRecording(false);
      return;
    }

    const mediaChunks = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        mediaChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(mediaChunks, { type: 'audio/webm' });
      blobToDataURL(blob).then((audioDataUrl) => {
        const entry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          transcript: 'Transcribing…',
          createdAt: new Date().toISOString(),
          audioDataUrl,
        };
        appendVoiceLog(entry);
        setVoiceRecording(entry);
      });

      try {
        // Routed through lib/api.js's transcribeAudio() instead of a
        // hardcoded fetch URL, so this moves with the rest of the app
        // (VITE_API_BASE_URL) across environments instead of being
        // pinned to this one dev host/port.
        const data = await transcribeAudio(blob);

        if (!data || typeof data !== 'object') {
          throw new Error('Transcription endpoint returned invalid response');
        }

        const transcript = (data.transcript || '').trim();

        if (!transcript) {
          setVoiceError('No speech detected. Please try again.');
          return;
        }

        setVoiceRecording((prev) => {
          if (!prev) return null;
          const updated = { ...prev, transcript };
          persistVoiceLog(updated);
          return updated;
        });

        // Voice input now fills the draft instead of auto-sending, so the
        // person can review/edit the transcript and use the Send button
        // (or Enter) the same way they would for typed text.
        const fullText = `${voiceBaseRef.current}${transcript ? ` ${transcript}` : ''}`.trim();
        if (fullText) {
          setDraft(fullText);
        }
      } catch (error) {
        console.error('Transcription error:', error);
        setVoiceError(`Transcription error: ${error?.message || 'Unknown error'}`);
      }
    };

    recorder.start();
    setVoiceDebug('Recording started');
  };

  const toggleVoice = () => {
    if (recording) {
      stopVoice();
      return;
    }
    if (!threadId || streaming || status !== 'open') return;
    startVoice();
  };

  useEffect(() => {
    if (!threadId) return;
    let off = false;

    if (initialMessage) {
      loadHistory([{ role: 'assistant', content: initialMessage, created_at: new Date().toISOString() }]);
    }

    getThreadMessages(threadId)
      .then((data) => {
        if (!off) {
          if (!initialMessage || (data.messages && data.messages.length > 1)) {
            loadHistory(data.messages);
          }
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [threadId, loadHistory, initialMessage]);

  const refreshLoops = () => {
    listLoops()
      .then((data) => setLoops(data.items || []))
      .catch(() => {});
  };

  const refreshThreadSummary = () => {
    if (!threadId) { setThreadSummary(null); return; }
    // Backend returns { thread_id, summary_text }, and the render below
    // reads threadSummary.summary_text / threadSummary.updated_at off the
    // whole object -- not a bare string. An empty summary_text (no summary
    // persisted yet for this thread) resolves to null, so the sidebar
    // section stays hidden rather than rendering an empty card.
    getThreadSummary(threadId)
      .then((data) => setThreadSummary(data && data.summary_text ? data : null))
      .catch(() => setThreadSummary(null));
  };

  useEffect(() => {
    refreshLoops();
  }, []);

  useEffect(() => {
    refreshThreadSummary();
  }, [threadId]);

  // Reset the save-to-journal panel whenever the thread changes, so an
  // in-progress pick from a previous thread doesn't leak into this one.
  useEffect(() => {
    setShowSaveToJournal(false);
    setJournalTargetBookId('');
    setNewJournalBookName('');
    setJournalSaveMessage('');
    setJournalSaveError(false);
  }, [threadId]);

  const toggleSaveToJournal = (checked) => {
    setShowSaveToJournal(checked);
    setJournalSaveMessage('');
    setJournalSaveError(false);
    if (checked && journalBooks.length === 0 && !loadingJournalBooks) {
      setLoadingJournalBooks(true);
      listJournalBooks()
        .then((data) => {
          const list = data.books || [];
          setJournalBooks(list);
          setJournalTargetBookId(list[0] ? String(list[0].id) : NEW_BOOK_OPTION);
        })
        .catch(() => {
          setJournalBooks([]);
          setJournalTargetBookId(NEW_BOOK_OPTION);
        })
        .finally(() => setLoadingJournalBooks(false));
    }
  };

  const handleSaveSummaryToJournal = async () => {
    if (!threadSummary?.summary_text) return;
    setSavingToJournal(true);
    setJournalSaveMessage('');
    setJournalSaveError(false);
    try {
      let bookId = journalTargetBookId;
      let bookName = journalBooks.find((b) => String(b.id) === String(bookId))?.name;

      if (bookId === NEW_BOOK_OPTION) {
        const name = newJournalBookName.trim();
        if (!name) throw new Error('Name the new book first.');
        const created = await createJournalBook({ name, color: '' });
        bookId = created.book.id;
        bookName = created.book.name;
        setJournalBooks((prev) => [...prev, created.book]);
        setJournalTargetBookId(String(bookId));
        setNewJournalBookName('');
      }

      await saveThreadSummaryAsJournalEntry({
  thread_id: threadId,
  body: threadSummary.summary_text,
  book_id: bookId,
});
      setJournalSaveMessage(`Saved to ${bookName || 'journal'}.`);
    } catch (e) {
      setJournalSaveError(true);
      setJournalSaveMessage(e?.message || 'Failed to save entry.');
    } finally {
      setSavingToJournal(false);
    }
  };

  useEffect(() => {
    if (!streaming) {
      refreshLoops();
      refreshThreadSummary();
    }
  }, [streaming]);

  // Tab-switch case: the socket stays open when the browser tab is merely
  // backgrounded (unlike navigating away, which unmounts this screen and
  // triggers the WebSocketDisconnect path server-side), so nothing else
  // catches it. Fire-and-forget on the way out; we don't wait for or
  // surface the result since the person has already moved on.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && threadId) {
        finalizeThreadSummary(threadId).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [threadId]);

  const activeLoops = loops.filter((l) => l.state === 'active');
  const topLoop = activeLoops[0];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const canSend = Boolean(draft.trim()) && Boolean(threadId) && !streaming && status === 'open';

  const submit = () => {
    const text = draft.trim();
    if (!text || streaming || status !== 'open') return;
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    unspokenTextRef.current = '';

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
      <TopBar
        crumb={
          <>
            <button
              className="nm-btn ghost"
              onClick={() => onNav && onNav('today')}
              style={{ padding: '2px 6px' }}
            >
              <Icon name="back" size={12} />
            </button>
            <b>{threadTitle || 'Reflection'}</b> <span className="sep">·</span>{' '}
            {threadId ? `thread ${threadId.slice(0, 8)}` : 'new'}
          </>
        }
      >
        <span className="nm-chip teal">
          <span className="nm-dot" />
          {status === 'open' ? 'live' : status}
        </span>

        {/* Side panel toggle */}
        
      </TopBar>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div className="nm-eyebrow" style={{ textAlign: 'center', marginBottom: 24, position: 'relative' }}>
              <span
                style={{
                  background: 'var(--surface)',
                  padding: '0 14px',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {threadId ? 'Conversation' : 'No thread selected'}
              </span>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  borderTop: '1px dashed var(--rule)',
                }}
              />
            </div>
            {messages.map((m, i) => (
              <Msg key={i} {...m} className="nm-msg" />
            ))}
            {streaming && (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  margin: '16px 0',
                  color: 'var(--ink-4)',
                }}
              >
                <ThinkingDots />
                <span className="nm-meta">Nextmate is reflecting…</span>
              </div>
            )}
            {error && (
              <div className="nm-body" style={{ color: 'var(--accent)', fontSize: 12 }}>
                {error}
              </div>
            )}
          </div>
        </div>

        <div
          className={`nm-side-panel${showSidePanel ? '' : ' collapsed'}`}
          style={{
            width: 300,
            flexShrink: 0,
            borderLeft: '1px solid var(--rule)',
            background: 'var(--paper)',
            padding: '24px 20px',
            overflowY: 'auto',
          }}
        >
          <div className="nm-eyebrow" style={{ marginBottom: 12 }}>
            Active patterns
          </div>

          {topLoop ? (
            <div className="nm-card" style={{ padding: 12, marginBottom: 16 }}>
              <div
                style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                title={topLoop.core_belief || topLoop.name}
              >
                <LoopRing strength={topLoop.strength} size={36} showLabel={false} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    "{topLoop.core_belief || topLoop.name}"
                  </div>
                  <div className="nm-meta" style={{ fontSize: 9.5, marginTop: 2 }}>
                    active · {topLoop.strength.toFixed(2)} · {topLoop.occurrences}×
                  </div>
                </div>
              </div>
              {activeLoops.length > 1 && (
                <div className="nm-meta" style={{ fontSize: 9.5, marginTop: 8 }}>
                  +{activeLoops.length - 1} more active
                </div>
              )}
            </div>
          ) : (
            <div className="nm-card" style={{ padding: 12, marginBottom: 16 }}>
              <div className="nm-meta" style={{ lineHeight: 1.5 }}>
                No active loops yet. Patterns name themselves once they recur.
              </div>
            </div>
          )}

          <div className="nm-hr dotted" />

          {threadSummary && (
            <>
              <div className="nm-eyebrow" style={{ marginBottom: 10 }}>
                This thread, so far
              </div>
              <div className="nm-card" style={{ padding: 12, marginBottom: 16 }}>
                <div className="nm-body" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                  {threadSummary.summary_text}
                </div>
                <div className="nm-meta" style={{ fontSize: 9.5, marginTop: 8 }}>
                  last updated {new Date(threadSummary.updated_at).toLocaleDateString()}
                </div>

                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--rule)' }}>
                  <label
                    className="nm-meta"
                    style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <span className="nm-switch">
                      <input
                        type="checkbox"
                        checked={showSaveToJournal}
                        onChange={(e) => toggleSaveToJournal(e.target.checked)}
                      />
                      <span className="nm-switch-slider"></span>
                    </span>
                    Save this summary as a journal entry
                  </label>

                  {showSaveToJournal && (
                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      {loadingJournalBooks ? (
                        <div className="nm-meta" style={{ fontSize: 11 }}>Loading books…</div>
                      ) : (
                        <>
                          <select
                            value={journalTargetBookId}
                            onChange={(e) => setJournalTargetBookId(e.target.value)}
                            style={{
                              fontSize: 11.5,
                              fontFamily: 'var(--font-mono)',
                              border: '1px solid var(--rule)',
                              background: 'var(--surface)',
                              color: 'var(--ink)',
                              borderRadius: 4,
                              padding: '4px 6px',
                            }}
                          >
                            {journalBooks.map((b) => (
                              <option key={b.id} value={String(b.id)}>
                                {b.name}
                              </option>
                            ))}
                            <option value={NEW_BOOK_OPTION}>+ New book…</option>
                          </select>

                          {journalTargetBookId === NEW_BOOK_OPTION && (
                            <input
                              type="text"
                              value={newJournalBookName}
                              onChange={(e) => setNewJournalBookName(e.target.value)}
                              placeholder="Name this book…"
                              style={{
                                fontSize: 12,
                                border: '1px solid var(--rule)',
                                background: 'var(--surface)',
                                color: 'var(--ink)',
                                borderRadius: 4,
                                padding: '6px 8px',
                              }}
                            />
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              className="nm-btn primary"
                              style={{ fontSize: 11.5, padding: '6px 10px' }}
                              onClick={handleSaveSummaryToJournal}
                              disabled={
                                savingToJournal ||
                                !threadSummary.summary_text ||
                                (journalTargetBookId === NEW_BOOK_OPTION && !newJournalBookName.trim())
                              }
                            >
                              {savingToJournal ? 'Saving…' : 'Save entry'}
                            </button>
                            {journalSaveMessage && (
                              <span
                                className="nm-meta"
                                style={{
                                  fontSize: 10.5,
                                  color: journalSaveError ? 'var(--accent)' : 'var(--teal)',
                                }}
                              >
                                {journalSaveMessage}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="nm-hr dotted" />
            </>
          )}

          <div className="nm-meta" style={{ lineHeight: 1.5, color: 'var(--ink-4)' }}>
            Nextmate doesn't provide clinical advice. Safety screens run on every message.
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', padding: '14px 40px', background: 'var(--surface)' }}>
        <div
          style={{
            maxWidth: 680,
            margin: '0 auto',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          {/* 1. Audio input — shown first, fills the draft below rather than auto-sending */}
          <button
            className="nm-btn"
            onClick={toggleVoice}
            disabled={
              !threadId || streaming || status !== 'open' || !speechSupported || !audioSupported
            }
            title={
              recording
                ? 'Stop voice input'
                : !audioSupported
                ? 'Audio recording is not supported'
                : speechSupported
                ? 'Start voice input'
                : 'Voice not supported'
            }
            style={{
              padding: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: recording ? 'var(--accent)' : undefined,
              color: recording ? '#fff' : undefined,
              animation: recording ? 'nm-pulse 1.2s infinite' : undefined,
            }}
          >
            <Icon name="mic" />
            {recording && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#fff',
                  animation: 'nm-blink 1.2s infinite ease-in-out',
                }}
              />
            )}
          </button>

          {/* 2. Text draft — typed directly, or filled in by the transcript above */}
          <textarea
            className="nm-textarea"
            placeholder={threadId ? 'Stay with the thought, or send a new one…' : 'Start a new reflection from the sidebar.'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={!threadId}
            style={{ minHeight: 42, maxHeight: 140, padding: '10px 14px', fontSize: 15, flex: 1 }}
          />

          {/* 3. Send — the explicit action, alongside Enter-to-send */}
          <button
            className="nm-btn primary"
            onClick={submit}
            disabled={!canSend}
            title="Send message"
            style={{
              padding: '10px 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
          >
            Send
            <Icon name="arrow" size={13} />
          </button>
        </div>

        {!recording && voiceError && (
          <div className="nm-meta" style={{ marginTop: 10, marginLeft: 6, color: 'var(--accent)' }}>
            {voiceError}
          </div>
        )}
        {voiceDebug && (
          <div className="nm-meta" style={{ marginTop: 10, marginLeft: 6, color: 'var(--ink-4)' }}>
            Voice debug: {voiceDebug}
          </div>
        )}
        {voiceRecording && (
          <div style={{ marginTop: 14, marginLeft: 6, width: '100%', display: 'grid', gap: 10 }}>
            <div className="nm-eyebrow">Latest voice recording</div>
            <audio controls src={voiceRecording.audioDataUrl} style={{ width: '100%' }} />
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>
              <strong>Transcript:</strong>{' '}
              {voiceRecording.transcript || 'No transcript detected'}
            </div>
          </div>
        )}

        {/* Voice output controls */}
        {!recording && (
          <div style={{ marginTop: 10, marginLeft: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            {/* Enable toggle */}
            <label
              className="nm-meta"
              style={{
                fontSize: 11.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={voiceOutputEnabled}
                onChange={(e) => setVoiceOutputEnabled(e.target.checked)}
                style={{ margin: 0 }}
              />
              SAY IT OUT LOUD !!
            </label>

            {/* Voice gender / picker — only shown when voice output is on */}
            {voiceOutputEnabled && (
              <>
                <label
                  className="nm-meta"
                  style={{
                    fontSize: 11.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  Voice:
                  <select
                    value={voiceGender}
                    onChange={(e) => {
                      setVoiceGender(e.target.value);
                      // Reset custom selection when switching away
                      if (e.target.value !== 'custom') setSelectedVoiceName('');
                    }}
                    style={{
                      fontSize: 11.5,
                      fontFamily: 'var(--font-mono)',
                      border: '1px solid var(--rule)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      borderRadius: 4,
                      padding: '1px 4px',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="custom">Custom…</option>
                  </select>
                </label>

                {/* Custom voice picker — only shown when "Custom…" is selected */}
                {voiceGender === 'custom' && availableVoices.length > 0 && (
                  <label
                    className="nm-meta"
                    style={{
                      fontSize: 11.5,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Pick voice:
                    <select
                      value={selectedVoiceName}
                      onChange={(e) => setSelectedVoiceName(e.target.value)}
                      style={{
                        fontSize: 11.5,
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid var(--rule)',
                        background: 'var(--surface)',
                        color: 'var(--ink)',
                        borderRadius: 4,
                        padding: '1px 4px',
                        maxWidth: 200,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">— choose —</option>
                      {availableVoices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};