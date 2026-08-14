import { useEffect, useState } from 'react';
import { Icon, TopBar, LoopRing, EmptyDataOverlay } from './Shell';
import { getDashboardInsights, answerDailyQuestion, reflectOnLoop } from '../../lib/api';
import { SAMPLE_TODAY_TRIGGERS } from '../../lib/tourSampleData';

const SampleBadge = () => <span className="nm-sample-badge">sample</span>;

const ThreadRow = ({ title, preview, date, msgs, loop, intensity, positive, last, onClick }) => (
  <div onClick={onClick} style={{ padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--rule-soft)', cursor: 'pointer' }} >
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          {loop && <span style={{ color: 'var(--accent)', fontSize: 10 }}>◐</span>}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>{title}</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="nm-meta" style={{ color: 'var(--ink-3)' }}>{date}</div>
        <div className="nm-meta" style={{ fontSize: 9.5 }}>
          {msgs} msgs{intensity != null && (
            <> · <span style={{ color: positive ? 'var(--teal)' : intensity >= 7 ? 'var(--accent)' : 'var(--ink-4)' }}>i{intensity}</span></>
          )}
        </div>
      </div>
    </div>
  </div>
);

const RAINBOW = ['#F28C6E','#F2C46E','#6ECFB5','#7C9CF5','#C97FE3','#E36F8C','#6EB5F2'];

const WeekDots = ({ days }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
    {days.map((d, i) => {
      const v = d.avg_intensity;
      return (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{
            height: v ? 34 + v * 4 : 14,
            background: v ? RAINBOW[i % RAINBOW.length] : 'transparent',
            border: v ? 'none' : '1px dashed var(--rule)',
            opacity: v ? 0.45 + (v / 10) * 0.55 : 1,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--ink)'
          }}>
            {v ? (Math.round(v * 100) / 100) : ''}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, marginTop: 5 }}>
            <div style={{ color: 'var(--ink-2)' }}>{d.weekday ? d.weekday.substring(0, 3) : '·'}</div>
            <div style={{ color: 'var(--ink-3)', fontSize: 8, marginTop: 2, height: 10 }}>
              {v ? (d.dominant_mood || 'neutral') : '—'}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

const TriggerBubbles = ({ triggers, colors }) => {
  // Positions relative to the center of the container
  const scatterOffsets = [
    { x: -100, y: -25 },
    { x: -35, y: 35 },
    { x: 35, y: -30 },
    { x: 100, y: 25 },
    { x: 0, y: 0 }
  ];

  // Calculate average X to perfectly center the cluster regardless of how many triggers there are
  const count = triggers.length;
  let sumX = 0;
  for (let i = 0; i < count; i++) {
    sumX += scatterOffsets[i % scatterOffsets.length].x;
  }
  const avgX = count > 0 ? sumX / count : 0;

  return (
    <div style={{ position: 'relative', height: 200, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px 0' }}>
      {triggers.map((t, i) => {
        const size = 70 + (t.pct / 100) * 40; // min 70px, max 110px
        const offset = scatterOffsets[i % scatterOffsets.length];
        
        // Apply the centering correction
        const cx = offset.x - avgX;
        const cy = offset.y;

        return (
          <div 
            key={t.trigger} 
            title={`${t.trigger} - ${t.pct}%`}
            className="nm-trigger-bubble"
            style={{
              '--offset-x': `${cx}px`,
              '--offset-y': `${cy}px`,
              width: size, height: size, borderRadius: '50%',
              background: colors[i % colors.length],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', flexShrink: 0,
              boxShadow: `0 6px 16px ${colors[i % colors.length]}66`,
              zIndex: 10 - i, // left items stay on top
              position: 'absolute',
              left: '50%',
              top: '50%',
              cursor: 'pointer'
            }}
          >
            <span style={{ 
              fontSize: Math.max(11, size * 0.15), 
              color: '#fff', 
              fontFamily: 'var(--font-mono)', 
              textAlign: 'center', 
              padding: '0 12px', 
              width: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {t.trigger}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.95)', fontFamily: 'var(--font-mono)', marginTop: 4, fontWeight: 'bold' }}>
              {t.pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

const TriggerBar = ({ label, pct, color, last }) => (
  <div style={{ marginBottom: last ? 0 : 10 }}>
    <div style={{ height: 6, background: 'var(--rule-soft)', borderRadius: 99, overflow: 'visible', position: 'relative' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, position: 'relative', minWidth: 'fit-content' }}>
        <span style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: '#fff',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}>{label}</span>
      </div>
    </div>
  </div>
);

const TRIGGER_COLORS = ['var(--accent)', 'var(--clay)', 'var(--teal)', 'var(--gold)', 'var(--ink-3)'];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Tonight';
};

const formatDateShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const fmtDelta = (cur, prev) => {
  if (cur == null || prev == null) return null;
  const diff = +(cur - prev).toFixed(1);
  if (diff === 0) return '±0';
  return diff > 0 ? `+${diff}` : `${diff}`;
};

const DUMMY_TODAY_INSIGHTS = {
  total_entries: 0,
  checkin_streak_days: 3,
  week: {
    days_with_entries: 5,
    stats: { avg_intensity: 6.2 },
    previous_stats: { avg_intensity: 5.8 },
    days: Array.from({ length: 7 }, (_, i) => ({
      avg_intensity: Math.floor(Math.random() * 6) + 2,
      dominant_mood: ['anxious', 'hopeful', 'tired', 'calm'][Math.floor(Math.random() * 4)],
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(new Date().getDay() + i + 1) % 7]
    }))
  },
  top_triggers: [
    { trigger: 'Work', pct: 40 },
    { trigger: 'Sleep', pct: 25 },
    { trigger: 'Social', pct: 20 },
    { trigger: 'Health', pct: 15 }
  ],
  loops: {
    items: [
      { loop_id: 'd1', name: 'Productivity Guilt', core_belief: 'I am not doing enough', strength: 0.85, state: 'active', occurrences: 12, trigger: 'Work' }
    ]
  }
};

export const TodayScreen = ({ onNav, threads = [], user, tourSample }) => {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answeringQuestion, setAnsweringQuestion] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [reflecting, setReflecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDashboardInsights(7)
      .then((data) => { if (!cancelled) { setInsights(data.insights); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const refreshInsights = async () => {
    const data = await getDashboardInsights(7);
    setInsights(data.insights);
    return data.insights;
  };

  const handleAnswerQuestion = async (question) => {
    if (!question) return;
    try {
      setAnsweringQuestion(true);
      const response = await answerDailyQuestion(question.id);
      if (response.success && response.thread_id) {
        await refreshInsights();
        if (onNav) {
          onNav('chat', {
            threadId: response.thread_id,
            threadTitle: `Daily Question: ${response.question_text || question.question_text || ''}`,
          });
        }
      } else {
        setError(response.message || 'Failed to answer question');
      }
    } catch (e) {
      setError(e.message || 'Failed to answer question');
    } finally {
      setAnsweringQuestion(false);
    }
  };

  const handleReflect = async () => {
    if (!topLoop) return;
    setReflecting(true);
    try {
      const result = await reflectOnLoop(topLoop.loop_id);
      if (result && result.thread_id) {
        if (onNav) onNav('chat', { threadId: result.thread_id, threadTitle: result.title, initialMessage: result.opening_message });
      }
    } catch (e) {
      setError(e.message || 'Failed to create reflection thread');
    } finally {
      setReflecting(false);
    }
  };

  const handleSkipQuestion = () => {
    setCurrentQuestionIdx((i) => {
      if (pendingQuestions.length === 0) return 0;
      return (i + 1) % pendingQuestions.length;
    });
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const userName = user?.email ? user.email.split('@')[0] : 'there';

  const QUOTES = [
    { text: "Be gentle with yourself.", author: "Anonymous" },
    { text: "You don't have to be positive all the time.", author: "Lori Deschene" },
    { text: "Almost everything will work again if you unplug it for a few minutes.", author: "Anne Lamott" },
    { text: "You are allowed to be both a masterpiece and a work in progress.", author: "Sophia Bush" },
    { text: "Feelings are just visitors, let them come and go.", author: "Mooji" },
    { text: "The present moment is the only moment available to us.", author: "Thich Nhat Hanh" },
    { text: "Owning our story and loving ourselves through that process is the bravest thing we'll ever do.", author: "Brené Brown" },
    { text: "You can't go back and change the beginning, but you can start where you are and change the ending.", author: "C.S. Lewis" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "What you are is what you have been. What you'll be is what you do now.", author: "Buddha" },
    { text: "The only way out is through.", author: "Robert Frost" },
    { text: "Talk to yourself like you would to someone you love.", author: "Brené Brown" },
    { text: "You are enough, just as you are.", author: "Meghan Markle" },
    { text: "Breathe. You are exactly where you need to be.", author: "Anonymous" },
    { text: "Small steps every day.", author: "Anonymous" },
  ];
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  const usingSample = Boolean(tourSample) && !loading && (insights?.total_lifetime_entries ?? 0) === 0;
  const isEmpty = !loading && (insights?.total_lifetime_entries === 0 || !insights) && threads.length === 0 && !usingSample;
  const displayInsights = (usingSample || isEmpty) ? DUMMY_TODAY_INSIGHTS : insights;

  const totalEntries = displayInsights?.total_entries ?? 0;
  
  const week = displayInsights?.week;
  const weekDays = week?.days || Array.from({ length: 7 }).map(() => ({ avg_intensity: null, dominant_mood: null, weekday: '' }));
  const daysWithEntries = week?.days_with_entries ?? 0;
  const avgIntensity = week?.stats?.avg_intensity;
  const prevAvgIntensity = week?.previous_stats?.avg_intensity;
  const intensityDelta = fmtDelta(avgIntensity, prevAvgIntensity);

  const topLoop = displayInsights?.loops?.items?.find((l) => l.state === 'active');
  const topTriggers = (displayInsights?.top_triggers || []).slice(0, 4);
  const dummyQuestions = [{ id: 'sample_q', question_text: "What's one small win you had today, even if it felt insignificant?", status: 'pending' }];
  const dailyQuestions = usingSample ? dummyQuestions : (Array.isArray(displayInsights?.daily_question) ? displayInsights.daily_question : []);
  const pendingQuestions = dailyQuestions.filter((q) => q.status === 'pending');
  const currentQuestion = pendingQuestions[currentQuestionIdx] || pendingQuestions[0] || null;

  return (
    <div className="nm-main">
      <TopBar crumb={<><b>Home</b> <span className="sep">/</span> {dateLabel}</>} />

      <div className="nm-content">
        <div style={{ maxWidth: 960, margin: '0 auto' }} className="nm-fade-up">
          {/* Hero */}
          <div style={{ marginBottom: 32 }} data-tour="today-hero">
            <div className="nm-eyebrow" style={{ marginBottom: 14 }}>
              {greeting()}, {userName}
            </div>
            <div className="nm-quote-card" style={{
              position: 'relative',
              borderLeft: '4px solid var(--accent)',
              paddingLeft: 24,
              marginBottom: 32,
              maxWidth: 750
            }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 34, lineHeight: 1.3, fontWeight: 'bold', letterSpacing: '-0.01em', color: 'var(--ink)', marginBottom: 16 }}>
                {isEmpty && !usingSample ? '"Every expert was once a beginner. Your story starts today."' : `"${quote.text}"`}
              </div>
              <div style={{ color: 'var(--accent)', fontSize: 18, fontStyle: 'italic', fontWeight: 'bold' }}>
                {isEmpty && !usingSample ? '— NexMate' : `— ${quote.author}`}
              </div>
            </div>
            {(!isEmpty || usingSample) && (
              <p className="nm-body" style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>
                Emotion intensity {avgIntensity ?? '—'} this week. Keep showing up. {usingSample && <SampleBadge />}
              </p>
            )}
            {isEmpty && !usingSample && (
              <p className="nm-body" style={{ fontSize: 15, color: 'var(--ink-2)' }}>
                Your insights, patterns, and emotional journey will appear here as you write and reflect.
              </p>
            )}
            {error && (
              <p className="nm-meta" style={{ color: 'var(--accent)', marginTop: 12 }}>
                Couldn't load insights: {error}
              </p>
            )}
          </div>

            {topLoop && (
              <EmptyDataOverlay 
                active={isEmpty && !usingSample} 
                title="Your journey begins here." 
                message="Start a chat or write your first journal entry to unlock your personalized insights."
                actionLabel="Begin a Chat"
                onAction={() => { onNav && onNav('chat'); }}
              >
                <div className="nm-card nm-fade-up" style={{ marginBottom: 24, padding: '20px 24px' }}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  <LoopRing strength={topLoop.strength} size={72} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span className="nm-chip teal"><span className="nm-dot" />Active loop</span>
                      <span className="nm-tag">strength {topLoop.strength.toFixed(2)} · {topLoop.occurrences}×</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontStyle: 'italic', lineHeight: 1.4, marginBottom: 8 }}>
                      "{topLoop.core_belief || topLoop.name}"
                    </div>
                    {topLoop.trigger && (
                      <p className="nm-body" style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-2)' }}>
                        Surfaces around <b>{topLoop.trigger}</b>{topLoop.valence ? <> · <b>{topLoop.valence}</b></> : null}.
                      </p>
                    )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="nm-btn" onClick={handleReflect} disabled={reflecting}>
                          {reflecting ? 'Reflecting…' : 'Reflect on this'} <Icon name="arrow" size={11} />
                        </button>
                        <button className="nm-btn ghost" onClick={() => onNav && onNav('loops')}>See all loops</button>
                      </div>
                    </div>
                  </div>
                </div>
              </EmptyDataOverlay>
            )}

            {/* Content Columns */}
            <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
              <EmptyDataOverlay 
                active={isEmpty && !usingSample} 
                title="Your journey begins here." 
                message="Start a chat or write your first journal entry to unlock your personalized insights."
                actionLabel="Begin a Chat"
                onAction={() => { onNav && onNav('chat'); }}
              >
                <div className="nm-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div>
                    <div className="nm-eyebrow" style={{ marginBottom: 16 }}>This week</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 54, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.018em' }}>{daysWithEntries}</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)' }}>of 7</div>
                    </div>
                    <div className="nm-body">days with reflections</div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <WeekDots days={weekDays} />
                  </div>

                  <div>
                    <div className="nm-hr" style={{ margin: '20px 0 14px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <div className="nm-tag">Emotion intensity</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>
                          {avgIntensity ?? '—'}
                        </div>
                      </div>
                      <div>
                        <div className="nm-tag">Streak</div>
                        <div className="nm-days-body" style={{ fontFamily: 'var(--font-display)' }}>
                          🔥 {displayInsights?.checkin_streak_days ?? 0}<span className="nm-meta" style={{ marginLeft: 6 }}>days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </EmptyDataOverlay>

              <EmptyDataOverlay 
                active={isEmpty && !usingSample} 
                title="Your journey begins here." 
                message="Start a chat or write your first journal entry to unlock your personalized insights."
                actionLabel="Begin a Chat"
                onAction={() => { onNav && onNav('chat'); }}
              >
                <div className="nm-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="nm-meta" style={{ marginBottom: 10 }}>Triggers, last 7 days</div>
                  {topTriggers.length === 0 ? (
                    <div className="nm-meta-data">No triggers detected yet.</div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <TriggerBubbles triggers={topTriggers} colors={TRIGGER_COLORS} />
                    </div>
                  )}
                </div>
              </EmptyDataOverlay>
            </div>

          <EmptyDataOverlay 
            active={isEmpty && !usingSample} 
            title="Your journey begins here." 
            message="Start a chat or write your first journal entry to unlock your personalized insights."
            actionLabel="Begin a Chat"
            onAction={() => { onNav && onNav('chat'); }}
          >
            <div className="nm-card" style={{ marginBottom: 16 }} data-tour="today-question">
              <div className="nm-meta" style={{ marginBottom: 10 }}>Today's question</div>
              {dailyQuestions.length === 0 ? (
                <div className="nm-meta-data" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>Your question is on its way — something thoughtful is being prepared for you.</div>
              ) : pendingQuestions.length === 0 ? (
                <div className="nm-meta-data" style={{ color: 'var(--teal)' }}>You've answered all of today's questions. See you tomorrow.</div>
              ) : currentQuestion ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.4, color: 'var(--ink)', letterSpacing: '-0.005em' }}>
                    {currentQuestion.question_text}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                    <button className="nm-btn" onClick={() => handleAnswerQuestion(currentQuestion)} disabled={answeringQuestion}>
                      {answeringQuestion ? 'Loading...' : 'Answer'} <Icon name="arrow" size={11} />
                    </button>
                    {pendingQuestions.length > 1 && (
                      <button className="nm-btn ghost" onClick={handleSkipQuestion}>Skip</button>
                    )}
                  </div>
                </>
              ) : (
                <div className="nm-meta-data">Your next question will appear shortly.</div>
              )}
            </div>
          </EmptyDataOverlay>
        </div>
      </div>
    </div>
  );
};