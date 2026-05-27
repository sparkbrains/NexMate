import { useEffect, useRef, useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';
import { useChatSocket } from '../../hooks/useChatSocket';
import { getThreadMessages, listLoops } from '../../lib/api';

const Msg = ({ from, text, meta, quoted, choices }) => {
  if (from === 'me') return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
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
  return (
    <div className="nm-fade-up" style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
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
}) => {
  const [draft, setDraft] = useState('');
  const [loops, setLoops] = useState([]);
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

  // Browser TTS helper
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

    if (voiceGender === 'custom' && selectedVoiceName) {
      // Use the explicitly chosen voice
      voice = voices.find((v) => v.name === selectedVoiceName) || null;
    } else if (voiceGender === 'female') {
      voice =
        voices.find((v) => v.name.toLowerCase().includes('female')) ||
        voices.find((v) => v.name.toLowerCase().includes('zira')) ||
        voices.find((v) => v.name.toLowerCase().includes('samantha')) ||
        voices.find((v) => v.name.toLowerCase().includes('google us english')) ||
        voices.find((v) => v.name.toLowerCase().includes('assistant')) ||
        null;
    } else if (voiceGender === 'male') {
      voice =
        voices.find((v) => v.name.toLowerCase().includes('male')) ||
        voices.find((v) => v.name.toLowerCase().includes('david')) ||
        voices.find((v) => v.name.toLowerCase().includes('alex')) ||
        voices.find((v) => v.name.toLowerCase().includes('google uk english male')) ||
        voices.find((v) => v.name.toLowerCase().includes('daniel')) ||
        null;
    }

    utterance.voice = voice || voices.find((v) => v.default) || null;
    utterance.lang = 'en-US';
    utterance.rate = 1.25;
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
        const token = localStorage.getItem('nextmate.token');
        const response = await fetch('http://127.0.0.1:8010/api/transcribe', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: blob,
        });

        const responseText = await response.text();
        let data = null;
        try {
          data = responseText ? JSON.parse(responseText) : null;
        } catch (parseError) {
          console.warn('Transcription response JSON parse failed', parseError, responseText);
        }

        if (!response.ok) {
          const errorMessage = data?.detail || responseText || 'Transcription failed';
          throw new Error(errorMessage);
        }

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

        const fullText = `${voiceBaseRef.current}${transcript ? ` ${transcript}` : ''}`.trim();
        if (fullText && send(fullText)) {
          setDraft('');
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

  useEffect(() => {
    refreshLoops();
  }, []);

  useEffect(() => {
    if (!streaming) refreshLoops();
  }, [streaming]);

  const activeLoops = loops.filter((l) => l.state === 'active');
  const topLoop = activeLoops[0];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

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
        <button className="nm-btn">
          <Icon name="more" size={12} />
        </button>
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
              <Msg key={i} {...m} />
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

        <aside
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
          <div className="nm-eyebrow" style={{ marginBottom: 10 }}>
            This thread
          </div>
          <StatLine label="Messages" value={messages.length} />
          <StatLine label="Connection" value={status} teal={status === 'open'} />
          <StatLine label="Active loops" value={activeLoops.length} />

          <div className="nm-hr dotted" />
          <div className="nm-meta" style={{ lineHeight: 1.5, color: 'var(--ink-4)' }}>
            Nextmate doesn't provide clinical advice. Safety screens run on every message.
          </div>
        </aside>
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
          <textarea
            className="nm-textarea"
            placeholder={threadId ? 'Stay with the thought, or send a new one…' : 'Start a new reflection from the sidebar.'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={!threadId}
            style={{ minHeight: 42, maxHeight: 140, padding: '10px 14px', fontSize: 15 }}
          />
          <button
            className="nm-btn primary"
            onClick={submit}
            disabled={!threadId || streaming || status !== 'open'}
            style={{ padding: '8px 14px' }}
          >
            <Icon name="arrow" />
          </button>
        </div>

        {recording && (
          <div className="nm-meta" style={{ marginTop: 10, marginLeft: 6 }}>
            Listening… Speak now to add your message.
          </div>
        )}
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