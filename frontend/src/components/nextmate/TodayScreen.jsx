import { useEffect, useState } from 'react';
import { Icon, TopBar } from './Shell';
import { getDashboardInsights, answerDailyQuestion } from '../../lib/api';

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
          }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, marginTop: 5 }}>{d.weekday?.[0] || '·'}</div>
        </div>
      );
    })}
  </div>
);

const TriggerBar = ({ label, pct, color, last }) => (
  <div style={{ marginBottom: last ? 0 : 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>{label}</span>
      <span className="nm-meta">{pct}%</span>
    </div>
    <div style={{ height: 3, background: 'var(--rule-soft)', borderRadius: 0, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
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

export const TodayScreen = ({ onNav, threads = [], user }) => {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answeringQuestion, setAnsweringQuestion] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);

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

  const handleSkipQuestion = () => {
    setCurrentQuestionIdx((i) => {
      if (pendingQuestions.length === 0) return 0;
      return (i + 1) % pendingQuestions.length;
    });
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const userName = user?.email ? user.email.split('@')[0] : 'there';

  const week = insights?.week;
  const weekDays = week?.days || Array.from({ length: 7 }).map(() => ({ avg_intensity: null, dominant_mood: null, weekday: '' }));
  const daysWithEntries = week?.days_with_entries ?? 0;
  const avgIntensity = week?.stats?.avg_intensity;
  const prevAvgIntensity = week?.previous_stats?.avg_intensity;
  const intensityDelta = fmtDelta(avgIntensity, prevAvgIntensity);

  const topTriggers = (insights?.top_triggers || []).slice(0, 4);
  const dailyQuestions = Array.isArray(insights?.daily_question) ? insights.daily_question : [];
  const pendingQuestions = dailyQuestions.filter((q) => q.status === 'pending');
  const currentQuestion = pendingQuestions[currentQuestionIdx] || pendingQuestions[0] || null;

  const QUOTES = [
    { text: 'The unexamined life is not worth living.', author: 'Socrates' },
    { text: 'Knowing yourself is the beginning of all wisdom.', author: 'Aristotle' },
    { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
    { text: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', author: 'Ralph Waldo Emerson' },
    { text: 'You are never too old to set another goal or to dream a new dream.', author: 'C.S. Lewis' },
    { text: 'The only way out is through.', author: 'Robert Frost' },
    { text: 'Almost everything will work again if you unplug it for a few minutes — including you.', author: 'Anne Lamott' },
    { text: 'Vulnerability is the birthplace of innovation, creativity, and change.', author: 'Brené Brown' },
    { text: 'You do not have to see the whole staircase, just take the first step.', author: 'Martin Luther King Jr.' },
    { text: 'The present moment always will have been.', author: 'Eckhart Tolle' },
  ];
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  const totalEntries = insights?.total_entries ?? 0;

  return (
    <div className="nm-main">
      <TopBar crumb={<><b>Today</b> <span className="sep">/</span> {dateLabel}</>} />

      <div className="nm-content">
        <div style={{ maxWidth: 960, margin: '0 auto' }} className="nm-fade-up">
          {/* Hero */}
          <div style={{ marginBottom: 32 }}>
            <div className="nm-eyebrow" style={{ marginBottom: 14 }}>
              {greeting()}, {userName} · {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <blockquote style={{ margin: 0, padding: 0, borderLeft: '3px solid var(--accent)', paddingLeft: 18 }}>
              <p className="nm-h1" style={{ fontStyle: 'italic', marginBottom: 10 }}>"{quote.text}"</p>
              <footer className="nm-meta" style={{ fontSize: 12 }}>— {quote.author}</footer>
            </blockquote>
            {error && (
              <p className="nm-meta" style={{ color: 'var(--accent)', marginTop: 12 }}>
                Couldn't load insights: {error}
              </p>
            )}
          </div>

          {/* Row 1: This week (left) + Triggers (right) */}
          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="nm-card">
              <div className="nm-eyebrow" style={{ marginBottom: 16 }}>This week · so far</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 54, lineHeight: 1, letterSpacing: '-0.03em' }}>{daysWithEntries}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)' }}>of 7</div>
              </div>
              <div className="nm-body" style={{ marginBottom: 20 }}>days with reflections</div>
              <WeekDots days={weekDays} />
              <div className="nm-hr" style={{ margin: '20px 0 14px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div className="nm-tag">Avg intensity</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>
                    {avgIntensity ?? '—'}
                    {intensityDelta && (
                      <span className="nm-meta" style={{ marginLeft: 6 }}>{intensityDelta}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="nm-tag">Streak</div>
                  <div className="nm-days-body" style={{ fontFamily: 'var(--font-display)' }}>
                    {insights?.checkin_streak_days ?? 0}<span className="nm-meta" style={{ marginLeft: 6 }}>days</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="nm-card">
              <div className="nm-meta" style={{ marginBottom: 10 }}>Triggers, last 7 days</div>
              {topTriggers.length === 0 && (
                <div className="nm-meta-data">No triggers detected yet.</div>
              )}
              {topTriggers.map((t, i) => (
                <TriggerBar
                  key={t.trigger}
                  label={t.trigger}
                  pct={t.pct}
                  color={TRIGGER_COLORS[i % TRIGGER_COLORS.length]}
                  last={i === topTriggers.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Row 2: Today's question (full width) */}
          <div className="nm-stagger">
            <div className="nm-card">
              <div className="nm-meta" style={{ marginBottom: 10 }}>Today's question</div>
              {dailyQuestions.length === 0 ? (
                <div className="nm-meta-data">Your daily questions will appear after your first reflection.</div>
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
                <div className="nm-meta-data">Your next question will appear after your first reflection.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};