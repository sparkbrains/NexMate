import { useEffect, useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';
import { getDashboardInsights, answerDailyQuestion, getDailyQuestionContext } from '../../lib/api';

const ThreadRow = ({ title, preview, date, msgs, loop, intensity, positive, last }) => (
  <div style={{ padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--rule-soft)', cursor: 'pointer' }}>
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

const WeekDots = ({ days }) => {
  const colorFor = (e) => ({
    overwhelm: 'var(--accent)', anxious: 'var(--clay)', stressed: 'var(--clay)',
    negative: 'var(--accent)', very_negative: 'var(--accent)', mixed: 'var(--clay)',
    tired: 'var(--ink-4)', neutral: 'var(--ink-4)',
    calm: 'var(--teal)', hopeful: 'var(--teal)', positive: 'var(--teal)', very_positive: 'var(--teal)',
  }[e] || 'var(--ink-4)');
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
      {days.map((d, i) => {
        const v = d.avg_intensity;
        const e = d.dominant_mood;
        return (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              height: v ? 34 + v * 4 : 14,
              background: v ? colorFor(e) : 'transparent',
              border: v ? 'none' : '1px dashed rgba(255,255,255,0.15)',
              opacity: v ? 0.4 + (v / 10) * 0.6 : 1,
              borderRadius: 2,
            }} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-4)', marginTop: 5 }}>{d.weekday?.[0] || '·'}</div>
          </div>
        );
      })}
    </div>
  );
};

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
  const [questionContext, setQuestionContext] = useState(null);
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

  const handleAnswerQuestion = async (question) => {
    try {
      setAnsweringQuestion(true);
      // Answer the question and get new thread ID
      const response = await answerDailyQuestion(question.id);
      
      if (response.success && response.thread_id) {
        // Refresh the dashboard data to update question statuses
        const refreshedData = await getDashboardInsights(7);
        setInsights(refreshedData.insights);
        
        // Navigate to the new thread for answering
        if (onNav) {
          onNav('chat', { threadId: response.thread_id });
        }
      } else {
        setError(response.message || 'Failed to answer question');
      }
    } catch (err) {
      setError(err.message || 'Failed to answer question');
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

  const topLoop = insights?.loops?.items?.find((l) => l.state === 'active');
  const newLoopsCount = insights?.loops?.new_in_window ?? 0;
  const topTriggers = (insights?.top_triggers || []).slice(0, 4);
  const echo = insights?.echo;
  const dailyQuestions = Array.isArray(insights?.daily_question) ? insights.daily_question : [];
  const pendingQuestions = dailyQuestions.filter(q => q.status === 'pending');
  const currentQuestion = pendingQuestions[currentQuestionIdx] || null;
  const isLastQuestion = currentQuestionIdx >= pendingQuestions.length - 1;
  const threadSummaries = insights?.thread_summaries || {};

  const recentThreads = threads.slice(0, 5);

  // Hero copy
  const totalEntries = insights?.total_entries ?? 0;
  let heroLead, heroSub;
  if (loading) {
    heroLead = <>Loading your reflections…</>;
    heroSub = '';
  } else if (totalEntries === 0) {
    heroLead = <>Your first reflection<br /><em>is waiting.</em></>;
    heroSub = 'Nextmate looks for patterns across your entries. Start with one moment from today.';
  } else if (topLoop) {
    heroLead = <>You've been circling<br /><em>the same question</em><br />for {topLoop.occurrences} entries.</>;
    heroSub = 'Nextmate noticed something across your recent entries. Want to sit with it before the day starts?';
  } else {
    heroLead = <>{totalEntries} reflection{totalEntries === 1 ? '' : 's'}<br /><em>and counting.</em></>;
    heroSub = `Avg intensity ${avgIntensity ?? '—'} this week. Keep showing up.`;
  }

  return (
    <div className="nm-main">
      <TopBar crumb={<><b>Today</b> <span className="sep">/</span> {dateLabel}</>}>
        <button className="nm-btn ghost"><Icon name="search" size={12} /> Search</button>
        <button className="nm-btn primary" onClick={() => onNav && onNav('chat')}><Icon name="plus" size={12} /> Begin reflection</button>
      </TopBar>

      <div className="nm-content">
        <div style={{ maxWidth: 960, margin: '0 auto' }} className="nm-fade-up">
          <div style={{ marginBottom: 32 }}>
            <div className="nm-eyebrow" style={{ marginBottom: 14 }}>
              {greeting()}, {userName} · {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <h1 className="nm-h1">{heroLead}</h1>
            {heroSub && (
              <p className="nm-lede" style={{ marginTop: 18, maxWidth: 620 }}>{heroSub}</p>
            )}
            {error && (
              <p className="nm-meta" style={{ color: 'var(--accent)', marginTop: 12 }}>
                Couldn't load insights: {error}
              </p>
            )}
          </div>

          {topLoop && (
            <div className="nm-card loop-alert nm-fade-up" style={{ marginBottom: 24, padding: '26px 30px' }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <LoopRing strength={topLoop.strength} size={96} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className="nm-chip accent"><span className="nm-dot" />Active loop</span>
                    <span className="nm-tag">strength {topLoop.strength.toFixed(2)} · {topLoop.occurrences} occurrences</span>
                  </div>
                  <h2 className="nm-h2" style={{ marginBottom: 10, fontStyle: 'italic', fontWeight: 400 }}>
                    "{topLoop.core_belief || topLoop.name}"
                  </h2>
                  {topLoop.trigger && (
                    <p className="nm-body" style={{ margin: 0, maxWidth: 560 }}>
                      Surfaces around <b>{topLoop.trigger}</b>{topLoop.valence ? <> with <b>{topLoop.valence}</b> valence</> : null}.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                    <button className="nm-btn accent" onClick={() => onNav && onNav('chat')}>Reflect on this <Icon name="arrow" size={12} /></button>
                    <button className="nm-btn" onClick={() => onNav && onNav('loops')}>See all {topLoop.occurrences} occurrences</button>
                    <button className="nm-btn ghost">Not today</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="nm-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div className="nm-h3">Recent threads</div>
                <div className="nm-meta">{recentThreads.length ? `last ${recentThreads.length} · open one to continue` : 'no threads yet'}</div>
              </div>
              {recentThreads.length === 0 && (
                <div className="nm-meta" style={{ padding: '20px 0' }}>
                  Start your first reflection to see it here.
                </div>
              )}
              {recentThreads.map((t, i) => {
                const summary = threadSummaries[t.thread_id] || {};
                return (
                  <ThreadRow
                    key={t.thread_id}
                    title={t.title || 'New thread'}
                    preview={t.preview || ''}
                    date={formatDateShort(t.updated_at)}
                    msgs={t.message_count ?? 0}
                    intensity={summary.avg_intensity ?? null}
                    positive={!!summary.positive}
                    last={i === recentThreads.length - 1}
                  />
                );
              })}
            </div>

            <div className="nm-card ink">
              <div className="nm-eyebrow" style={{ marginBottom: 16 }}>This week · so far</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 54, lineHeight: 1, letterSpacing: '-0.03em' }}>{daysWithEntries}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-4)' }}>of 7</div>
              </div>
              <div className="nm-body" style={{ color: 'var(--ink-4)', marginBottom: 20 }}>days with reflections</div>

              <WeekDots days={weekDays} />

              <div className="nm-hr" style={{ background: 'rgba(255,255,255,0.08)', margin: '20px 0 14px' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div className="nm-tag" style={{ color: 'var(--ink-4)' }}>Avg intensity</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>
                    {avgIntensity ?? '—'}
                    {intensityDelta && (
                      <span className="nm-meta" style={{ color: 'var(--ink-4)', marginLeft: 6 }}>{intensityDelta}</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="nm-tag" style={{ color: 'var(--ink-4)' }}>Streak</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)' }}>
                    {insights?.checkin_streak_days ?? 0}<span className="nm-meta" style={{ color: 'var(--ink-4)', marginLeft: 6 }}>days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="nm-card soft">
              <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Triggers, last 7 days</div>
              {topTriggers.length === 0 && (
                <div className="nm-meta">No triggers detected yet.</div>
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
            <div className="nm-card soft">
              <div className="nm-eyebrow" style={{ marginBottom: 10 }}><Icon name="sparkle" size={10} /> {echo ? `Echo from ${echo.age_days} days ago` : 'Echo'}</div>
              {echo ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.45, fontStyle: 'italic', color: 'var(--ink)', letterSpacing: '-0.005em' }}>
                    "{echo.text}"
                  </div>
                  <div className="nm-meta" style={{ marginTop: 12 }}>— you, {formatDateShort(echo.date)}</div>
                </>
              ) : (
                <div className="nm-meta">Echoes appear after ~60 days of reflections.</div>
              )}
            </div>
            <div className="nm-card soft">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div className="nm-eyebrow">Today's question</div>
                {pendingQuestions.length > 1 && (
                  <div className="nm-meta">{currentQuestionIdx + 1} / {pendingQuestions.length}</div>
                )}
              </div>
              {dailyQuestions.length === 0 ? (
                <div className="nm-meta">Your daily questions will appear after your first reflection.</div>
              ) : pendingQuestions.length === 0 ? (
                <div className="nm-meta" style={{ color: 'var(--teal)' }}>You've answered all of today's questions. See you tomorrow.</div>
              ) : currentQuestion ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.45, color: 'var(--ink)', letterSpacing: '-0.005em', marginBottom: 14 }}>
                    {currentQuestion.question_text}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="nm-btn"
                        onClick={() => handleAnswerQuestion(currentQuestion)}
                        disabled={answeringQuestion}
                      >
                        {answeringQuestion ? 'Loading…' : 'Answer'} <Icon name="arrow" size={11} />
                      </button>
                      <button
                        className="nm-btn ghost"
                        onClick={handleSkipQuestion}
                      >
                        Skip
                      </button>
                    </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};