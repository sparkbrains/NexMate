import { useEffect, useMemo, useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';
import { getDashboardInsights } from '../../lib/api';

const MOOD_COLORS = {
  overwhelm: 'var(--accent)', stressed: 'var(--accent)', negative: 'var(--accent)', very_negative: 'var(--accent)',
  anxious: 'var(--clay)', mixed: 'var(--clay)',
  hopeful: 'var(--teal)', positive: 'var(--teal)', very_positive: 'var(--teal)', calm: 'var(--teal-soft)',
  tired: 'var(--ink-3)', neutral: 'var(--ink-3)',
};
const moodColor = (m) => MOOD_COLORS[m] || 'var(--ink-3)';

const formatShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const EmotionChart = ({ trend }) => {
  const days = trend?.length || 0;
  if (!days) return <div className="nm-meta" style={{ padding: 30 }}>No data in this window yet.</div>;

  const w = 600, h = 170;
  const dx = days > 1 ? w / (days - 1) : w;

  // Build stacked mood bands per day (normalized to mood mix proportions per day, weighted by entry count)
  // Collect all moods seen
  const moodSet = new Set();
  trend.forEach((d) => Object.keys(d.moods || {}).forEach((m) => moodSet.add(m)));
  const moods = [...moodSet];
  if (moods.length === 0) {
    return <div className="nm-meta" style={{ padding: 30 }}>No mood data yet.</div>;
  }

  // Per-day stacks (normalize by total in day)
  const stacks = trend.map((d) => {
    const total = Object.values(d.moods || {}).reduce((a, b) => a + b, 0) || 0;
    if (!total) return moods.map(() => 0);
    return moods.map((m) => (d.moods?.[m] || 0) / total);
  });

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {moods.map((m, mi) => {
        const top = [], bot = [];
        for (let i = 0; i < days; i++) {
          const stack = stacks[i];
          let cum = 0;
          for (let k = 0; k <= mi; k++) cum += stack[k];
          let prev = 0;
          for (let k = 0; k < mi; k++) prev += stack[k];
          top.push([i * dx, h - cum * h * 0.9]);
          bot.push([i * dx, h - prev * h * 0.9]);
        }
        const path = 'M' + top.map((p) => p.join(',')).join(' L ') + ' L ' + bot.reverse().map((p) => p.join(',')).join(' L ') + ' Z';
        return <path key={m} d={path} fill={moodColor(m)} opacity="0.88" />;
      })}
      <line x1="0" y1={h} x2={w} y2={h} stroke="var(--rule)" />
    </svg>
  );
};

const IntensityBars = ({ distribution }) => {
  const counts = (distribution || []).map((d) => d.count);
  const max = Math.max(1, ...counts);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 96 }}>
      {(distribution || []).map((d, i) => (
        <div key={d.intensity} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%',
            height: `${(d.count / max) * 100}%`,
            background: d.intensity >= 8 ? 'var(--accent)' : d.intensity >= 6 ? 'var(--clay)' : d.intensity <= 3 ? 'var(--teal)' : 'var(--rule-soft)',
            minHeight: d.count ? 2 : 0,
          }} />
          <span className="nm-meta" style={{ fontSize: 9 }}>{d.intensity}</span>
        </div>
      ))}
    </div>
  );
};

const BigStat = ({ label, value, color }) => (
  <div>
    <div className="nm-numeral sm" style={{ color: color || 'var(--ink)' }}>{value}</div>
    <div className="nm-meta" style={{ marginTop: 6 }}>{label}</div>
  </div>
);

const TriggerHeat = ({ heatmap, days }) => {
  if (!heatmap || heatmap.length === 0) {
    return <div className="nm-meta" style={{ padding: 20 }}>No triggers detected in this window.</div>;
  }
  const cols = days || heatmap[0]?.cells?.length || 30;
  const shade = (v) => v <= 0 ? 'var(--rule-soft)' : v < 0.34 ? 'var(--loop-light)' : v < 0.67 ? 'var(--loop-medium)' : 'var(--loop-strong)';
  const today = new Date();
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, marginLeft: 88, marginBottom: 6 }}>
        {Array.from({ length: cols }).map((_, i) => {
          const offset = cols - 1 - i;
          const d = new Date(today);
          d.setDate(d.getDate() - offset);
          const showLabel = i % 7 === 0;
          return (
            <div key={i} className="nm-meta" style={{ flex: 1, fontSize: 9, textAlign: 'center', color: showLabel ? 'var(--ink-2)' : 'transparent' }}>
              {showLabel ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '·'}
            </div>
          );
        })}
      </div>
      {heatmap.map((row) => (
        <div key={row.trigger} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 80, fontSize: 12, textAlign: 'right', fontFamily: 'var(--font-display)' }}>{row.trigger}</div>
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {row.intensity.map((v, i) => <div key={i} style={{ flex: 1, aspectRatio: '1', background: shade(v) }} />)}
          </div>
        </div>
      ))}
    </div>
  );
};

const LoopSummary = ({ loops }) => {
  if (!loops || loops.length === 0) {
    return <div className="nm-meta" style={{ padding: 16 }}>No loops detected yet. They surface after recurring patterns appear in your reflections.</div>;
  }
  return (
    <div>
      {loops.slice(0, 6).map((l, i) => (
        <div key={l.loop_id || i} style={{ padding: '10px 0', borderBottom: i === Math.min(loops.length, 6) - 1 ? 'none' : '1px dashed var(--rule)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontStyle: 'italic' }}>"{l.core_belief || l.name}"</div>
            <span className={'nm-chip ' + (l.state === 'resolved' ? 'teal' : 'accent')} style={{ fontSize: 9.5 }}>{l.state}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 2, background: 'var(--rule-soft)', overflow: 'hidden' }}>
              <div style={{ width: `${l.strength * 100}%`, height: '100%', background: l.state === 'resolved' ? 'var(--teal)' : 'var(--accent)' }} />
            </div>
            <span className="nm-meta">{l.occurrences}× · {l.strength.toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const fmtDelta = (cur, prev) => {
  if (cur == null || prev == null) return null;
  return +(cur - prev).toFixed(1);
};

const G = ({ label, before, after, good, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)', gap: 8 }}>
    <div style={{ flex: 1, fontSize: 13 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>{before ?? '—'}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>→</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: good ? 'var(--teal)' : 'var(--ink)' }}>{after ?? '—'}</div>
    {after != null && before != null && (
      <span style={{ fontSize: 13, color: good ? 'var(--teal)' : 'var(--accent)' }}>{good ? '↑' : '↓'}</span>
    )}
  </div>
);

const RANGES = [
  { k: '7d', d: 7 },
  { k: '30d', d: 30 },
  { k: '90d', d: 90 },
  { k: '1y', d: 365 },
];

export const InsightsScreen = () => {
  const [rangeKey, setRangeKey] = useState('30d');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const days = useMemo(() => RANGES.find((r) => r.k === rangeKey)?.d ?? 30, [rangeKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDashboardInsights(days)
      .then((data) => { if (!cancelled) { setInsights(data.insights); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const totalEntries = insights?.total_entries ?? 0;
  const threadCount = insights?.thread_count ?? 0;
  const messageCount = insights?.message_count ?? 0;

  const intensityAvg = insights?.intensity_stats?.avg;
  const peak = insights?.intensity_stats?.peak;
  const peakDay = insights?.intensity_stats?.peak_day;
  const low = insights?.intensity_stats?.low;
  const lowDay = insights?.intensity_stats?.low_day;

  const moods = insights?.mood_breakdown || [];

  const growthCur = insights?.growth?.current;
  const growthPrev = insights?.growth?.previous;
  const intensityDelta = fmtDelta(growthCur?.avg_intensity, growthPrev?.avg_intensity);
  const threadsDelta = fmtDelta(growthCur?.threads, growthPrev?.threads);

  const loops = insights?.loops?.items || [];
  const loopsActive = insights?.loops?.active ?? 0;
  const loopsResolved = insights?.loops?.resolved ?? 0;
  const loopsNew = insights?.loops?.new_in_window ?? 0;

  return (
    <div className="nm-main">
      <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Insights</b></>}>
        <div className="nm-range">
          {RANGES.map((r) => (
            <button
              key={r.k}
              onClick={() => setRangeKey(r.k)}
              className={r.k === rangeKey ? 'on' : ''}
            >
              {r.k}
            </button>
          ))}
        </div>
        <button className="nm-btn"><Icon name="download" size={12} /> Export</button>
      </TopBar>

      <div className="nm-content">
        <div style={{ maxWidth: 1080, margin: '0 auto' }} className="nm-fade-up">
          <header className="nm-hero">
            <div>
              <div className="nm-eyebrow" style={{ marginBottom: 12 }}>
                Last {days} days · {threadCount} thread{threadCount === 1 ? '' : 's'} · {totalEntries} reflection{totalEntries === 1 ? '' : 's'}
              </div>
              <h1 className="nm-h1">
                {totalEntries === 0 ? <>A blank window —<br /><em>begin reflecting</em>.</> : <>The shape of your <em>{days <= 7 ? 'week' : days <= 30 ? 'month' : 'season'}</em>.</>}
              </h1>
            </div>
            <div className="nm-hero-meta">
              avg intensity <b>{intensityAvg ?? '—'}</b>{' '}
              {intensityDelta != null && (
                <span style={{ color: intensityDelta < 0 ? 'var(--teal)' : 'var(--accent)' }}>
                  {intensityDelta > 0 ? '+' : ''}{intensityDelta}
                </span>
              )}
              <br />
              loops resolved <b style={{ color: 'var(--teal)' }}>{loopsResolved}</b> · new <b style={{ color: 'var(--accent)' }}>{loopsNew}</b>
            </div>
          </header>

          {totalEntries === 0 && !loading && (
            <div className="nm-empty-poem">
              <p>Patterns surface only after the page is filled. Open a thread, write a sentence, and these charts begin to mean something.</p>
            </div>
          )}

          {error && (
            <div className="nm-card" style={{ marginBottom: 14, color: 'var(--accent)' }}>
              Couldn't load insights: {error}
            </div>
          )}

          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="nm-card">
              <div style={{ marginBottom: 14 }}>
                <div className="nm-eyebrow">Emotion trend</div>
                <div className="nm-h3" style={{ marginTop: 4 }}>
                  {totalEntries === 0 ? 'Start reflecting to see your trend.' : 'Daily mood mix'}
                </div>
              </div>
              <EmotionChart trend={insights?.emotion_trend} />
              <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                {moods.slice(0, 6).map((m) => (
                  <div key={m.mood} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                    <span style={{ width: 10, height: 10, background: moodColor(m.mood), borderRadius: 1 }} />
                    <span>{m.mood}</span><span className="nm-meta">{m.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="nm-card">
              <div className="nm-eyebrow" style={{ marginBottom: 4 }}>Intensity distribution</div>
              <div className="nm-h3" style={{ marginBottom: 18 }}>
                {intensityAvg != null ? `Avg intensity ${intensityAvg}` : 'No intensity data yet'}
              </div>
              <IntensityBars distribution={insights?.intensity_distribution} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
                <BigStat label="avg" value={intensityAvg ?? '—'} />
                <BigStat label={peakDay ? `peak · ${formatShort(peakDay)}` : 'peak'} value={peak ?? '—'} color="var(--accent)" />
                <BigStat label={lowDay ? `low · ${formatShort(lowDay)}` : 'low'} value={low ?? '—'} color="var(--teal)" />
              </div>
            </div>
          </div>

          <div className="nm-card" style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 14 }}>
              <div className="nm-eyebrow">Trigger heatmap</div>
              <div className="nm-h3" style={{ marginTop: 4 }}>When each trigger showed up</div>
            </div>
            <TriggerHeat heatmap={insights?.trigger_heatmap} days={days} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="nm-card">
              <div className="nm-eyebrow" style={{ marginBottom: 4 }}>Loop occurrences</div>
              <div className="nm-h3" style={{ marginBottom: 18 }}>{loopsActive} active · {loopsResolved} resolved</div>
              <LoopSummary loops={loops} />
            </div>
            <div className="nm-card soft">
              <div className="nm-eyebrow" style={{ marginBottom: 12 }}>Growth · this window vs prior</div>
              <G label="Threads" before={growthPrev?.threads} after={growthCur?.threads} good={(growthCur?.threads ?? 0) >= (growthPrev?.threads ?? 0)} />
              <G label="Reflections" before={growthPrev?.entries} after={growthCur?.entries} good={(growthCur?.entries ?? 0) >= (growthPrev?.entries ?? 0)} />
              <G label="Avg intensity" before={growthPrev?.avg_intensity} after={growthCur?.avg_intensity} good={intensityDelta != null && intensityDelta < 0} />
              <G label="Resolved loops" before={0} after={loopsResolved} good={loopsResolved > 0} last />
            </div>
          </div>

          {loading && totalEntries === 0 && (
            <div className="nm-meta" style={{ textAlign: 'center', marginTop: 24 }}>Loading insights…</div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Weekly screen kept mostly as-is (mocked); will be wired in a follow-up. ---

const WStat = ({ label, value, delta, good }) => (
  <div style={{ borderLeft: '2px solid var(--rule)', paddingLeft: 16 }}>
    <div className="nm-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
    <div className="nm-numeral sm">{value}</div>
    {delta && <div className="nm-meta" style={{ marginTop: 6, color: good ? 'var(--teal)' : 'var(--ink-4)' }}>{delta} vs last</div>}
  </div>
);

export const WeeklyScreen = () => {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDashboardInsights(7)
      .then((d) => { if (!cancelled) setInsights(d.insights); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const week = insights?.week;
  const days = week?.days || [];
  const stats = week?.stats || {};
  const prev = week?.previous_stats || {};
  const intensityDelta = fmtDelta(stats.avg_intensity, prev.avg_intensity);
  const topTriggers = insights?.top_triggers || [];

  return (
    <div className="nm-main">
      <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Weekly report</b></>}>
        <button className="nm-btn primary"><Icon name="download" size={12} /> PDF</button>
      </TopBar>
      <div className="nm-content">
        <div style={{ maxWidth: 760, margin: '0 auto' }} className="nm-fade-up">
          <header className="nm-hero">
            <div>
              <div className="nm-eyebrow" style={{ marginBottom: 12 }}>
                {(() => {
                  const today = new Date();
                  const start = new Date(today); start.setDate(today.getDate() - 6);
                  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return `Week of ${fmt(start)} – ${fmt(today)}`;
                })()}
              </div>
              <h1 className="nm-h1">
                {loading ? 'Drawing the week…' : (stats.entries ? <>Your week, <em>so far</em>.</> : <>A blank week —<br /><em>still time</em>.</>)}
              </h1>
            </div>
          </header>

          <div className="nm-grid-4 nm-stagger" style={{ marginBottom: 36 }}>
            <WStat label="Threads" value={stats.threads ?? 0} delta={prev.threads != null ? `${(stats.threads ?? 0) - (prev.threads ?? 0) >= 0 ? '+' : ''}${(stats.threads ?? 0) - (prev.threads ?? 0)}` : null} good={(stats.threads ?? 0) >= (prev.threads ?? 0)} />
            <WStat label="Avg intensity" value={stats.avg_intensity ?? '—'} delta={intensityDelta != null ? (intensityDelta > 0 ? `+${intensityDelta}` : `${intensityDelta}`) : null} good={intensityDelta != null && intensityDelta < 0} />
            <WStat label="Active loops" value={insights?.loops?.active ?? 0} />
            <WStat label="New patterns" value={insights?.loops?.new_in_window ?? 0} />
          </div>

          <section style={{ marginBottom: 36 }} className="nm-fade-up">
            <div className="nm-eyebrow" style={{ marginBottom: 6 }}>01 · Emotional trend</div>
            <h2 className="nm-h2" style={{ marginBottom: 14 }}>Day-by-day intensity</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {days.map((d) => (
                <div key={d.day} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: 80,
                    background: d.dominant_mood ? moodColor(d.dominant_mood) : 'transparent',
                    border: d.dominant_mood ? 'none' : '1px dashed var(--rule)',
                    opacity: d.avg_intensity ? 0.35 + (d.avg_intensity / 10) * 0.6 : 0.5,
                    borderRadius: 2,
                    position: 'relative',
                  }}>
                    {d.avg_intensity != null && (
                      <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)' }}>{d.avg_intensity}</div>
                    )}
                  </div>
                  <div className="nm-meta" style={{ marginTop: 6 }}>{d.weekday}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{d.dominant_mood || '—'}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 36 }} className="nm-fade-up">
            <div className="nm-eyebrow" style={{ marginBottom: 6 }}>02 · Triggers</div>
            <h2 className="nm-h2" style={{ marginBottom: 14 }}>{topTriggers[0] ? `${topTriggers[0].trigger} leads the week.` : 'No triggers yet.'}</h2>
            {topTriggers.length === 0 && <div className="nm-meta">No triggers detected this window.</div>}
            {topTriggers.map((t, i) => (
              <div key={t.trigger} style={{ display: 'grid', gridTemplateColumns: '20px 100px 1fr 50px', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i === topTriggers.length - 1 ? 'none' : '1px dashed var(--rule)' }}>
                <span className="nm-meta">{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{t.trigger}</span>
                <div style={{ height: 4, background: 'var(--rule-soft)', overflow: 'hidden' }}>
                  <div style={{ width: `${t.pct}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
                <span className="nm-meta" style={{ textAlign: 'right' }}>{t.count}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
};
