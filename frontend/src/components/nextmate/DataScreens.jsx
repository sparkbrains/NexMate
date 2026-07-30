import { useEffect, useMemo, useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';
import { getDashboardInsights } from '../../lib/api';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, Legend
} from 'recharts';

const MOOD_COLORS = {
  overwhelm: 'var(--accent)', stressed: 'var(--accent)', negative: 'var(--accent)', very_negative: 'var(--accent)',
  anxious: 'var(--clay)', mixed: 'var(--clay)',
  hopeful: 'var(--teal)', positive: 'var(--teal)', very_positive: 'var(--teal)', calm: 'var(--teal-soft)',
  tired: 'var(--ink-3)', neutral: 'var(--ink-3)',
};
const moodColor = (m) => MOOD_COLORS[m] || 'var(--ink-3)';

const LINE_COLORS = [
  '#7C9CF5', '#F28C6E', '#6ECFB5', '#C97FE3',
  '#F2C46E', '#E36F8C', '#6EB5F2', '#A8E36F',
];

const formatShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Slice the last N items from an array
const sliceLast = (arr, n) => (arr || []).slice(-n);

// Given granularity, how many data points to show
const GRANULARITY_WINDOW = { day: 1, week: 7, month: 30 };

// Format an x-axis tick label based on granularity
const formatTick = (iso, granularity) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (granularity === 'day') return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (granularity === 'week') return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const EmotionChart = ({ trend }) => {
  const days = trend?.length || 0;
  if (!days) return <div className="nm-meta" style={{ padding: 30 }}>No data in this window yet.</div>;

  const w = 600, h = 170;
  const dx = days > 1 ? w / (days - 1) : w;

  const moodSet = new Set();
  trend.forEach((d) => Object.keys(d.moods || {}).forEach((m) => moodSet.add(m)));
  const moods = [...moodSet];
  if (moods.length === 0) {
    return <div className="nm-meta" style={{ padding: 30 }}>No mood data yet.</div>;
  }

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

// Sliced heatmap: trim each row's intensity array to the last N cells
const sliceHeatmap = (heatmap, n) =>
  (heatmap || []).map((row) => ({ ...row, intensity: (row.intensity || []).slice(-n) }));

const TriggerHeat = ({ heatmap, granularity }) => {
  if (!heatmap || heatmap.length === 0) {
    return <div className="nm-meta" style={{ padding: 20 }}>No triggers detected in this window.</div>;
  }

  const cols = heatmap[0]?.intensity?.length || 1;
  const shade = (v) => v <= 0 ? 'var(--rule-soft)' : v < 0.34 ? 'var(--loop-light)' : v < 0.67 ? 'var(--loop-medium)' : 'var(--loop-strong)';
  const today = new Date();

  const labelEvery = granularity === 'day' ? 4 : granularity === 'week' ? 1 : 7;

  const getColDate = (i) => {
    const offset = cols - 1 - i;
    const d = new Date(today);
    if (granularity === 'day') {
      d.setHours(d.getHours() - offset);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    d.setDate(d.getDate() - offset);
    if (granularity === 'week') return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: cols * 22 + 96 }}>
        <div style={{ display: 'flex', gap: 2, marginLeft: 88, marginBottom: 6 }}>
          {Array.from({ length: cols }).map((_, i) => {
            const show = i % labelEvery === 0;
            return (
              <div key={i} className="nm-meta" style={{ flex: 1, fontSize: 9, textAlign: 'center', color: show ? 'var(--ink-2)' : 'transparent' }}>
                {show ? getColDate(i) : '·'}
              </div>
            );
          })}
        </div>
        {heatmap.map((row) => (
          <div key={row.trigger} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ width: 80, fontSize: 12, textAlign: 'right', fontFamily: 'var(--font-display)', flexShrink: 0 }}>{row.trigger}</div>
            <div style={{ display: 'flex', gap: 2, flex: 1 }}>
              {row.intensity.map((v, i) => (
                <div key={i} style={{ flex: 1, height: 16, background: shade(v), minWidth: 18 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LoopSummary = ({ loops }) => {  if (!loops || loops.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', background: 'rgba(78, 205, 196, 0.05)', borderRadius: 8, border: '1px dashed var(--teal)' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
        <div style={{ color: 'var(--teal)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>No Patterns Yet</div>
        <div className="nm-meta" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Keep journaling! We need more data to detect your recurring emotional loops and behavioral patterns.
        </div>
      </div>
    );
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

const G = ({ label, after, good, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)', gap: 8 }}>
    <div style={{ flex: 1, fontSize: 13 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: good ? 'var(--teal)' : 'var(--ink)' }}>{after ?? '—'}</div>
    {after != null && (
      <span style={{ fontSize: 13, color: good ? 'var(--teal)' : 'var(--accent)' }}>{good ? '↑' : '↓'}</span>
    )}
  </div>
);

const ValenceIntensityLineChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="nm-meta" style={{ padding: 30 }}>No valence/intensity data yet.</div>;
  }
  const w = 600, h = 120;
  const n = data.length;
  const dx = n > 1 ? w / (n - 1) : w;
  const valPoints = data.map((d, i) => [i * dx, h - ((d.valence + 1) / 2) * h * 0.9]).map(p => p.join(',')).join(' L ');
  const intPoints = data.map((d, i) => [i * dx, h - (d.intensity / 10) * h * 0.9]).map(p => p.join(',')).join(' L ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', marginTop: 8 }}>
      <polyline points={valPoints} fill="none" stroke="var(--teal)" strokeWidth="2" />
      <polyline points={intPoints} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 2" />
      <line x1="0" y1={h} x2={w} y2={h} stroke="var(--rule)" />
    </svg>
  );
};

const EMOTION_PALETTE = [
  '#FF6B6B', // vibrant red
  '#4ECDC4', // vibrant teal
  '#45B7D1', // bright blue
  '#FDCB6E', // warm yellow
  '#6C5CE7', // vibrant purple
  '#FD79A8', // bright pink
  '#00B894', // strong green
  '#E17055', // orange
  '#0984E3', // deep vibrant blue
  '#D63031', // crimson
];

const EmotionMixBars = ({ trend, granularity, emotions }) => {
  const n = trend?.length || 0;
  if (!n) return <div className="nm-meta" style={{ padding: 30 }}>No emotion data yet.</div>;
  if (!emotions?.length) return <div className="nm-meta" style={{ padding: 30 }}>No mood data yet.</div>;

  const BAR_W = 28;
  const GAP = 6;
  const PAD_L = 40;  // y-axis labels
  const PAD_T = 24;  // date labels
  const PAD_B = 16;
  const PAD_R = 12;
  const CHART_H = 160;

  const svgW = n * (BAR_W + GAP) - GAP + PAD_R;
  const svgH = PAD_T + CHART_H + PAD_B;
  const tickEvery = n <= 7 ? 1 : n <= 14 ? 2 : n <= 31 ? 4 : 7;

  const YAXIS_W = PAD_L;

  return (
    <div style={{ marginTop: 8, height: 220, border: '1px solid var(--rule)', borderRadius: 4, display: 'flex' }}>
      <svg width={YAXIS_W} height={svgH} style={{ flexShrink: 0, display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(v => {
          const y = PAD_T + CHART_H - v * CHART_H;
          return (
            <text key={v} x={YAXIS_W - 5} y={y + 3.5} textAnchor="end"
              style={{ fontSize: 9, fill: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
              {Math.round(v * 100)}%
            </text>
          );
        })}
        <text transform={`translate(10, ${PAD_T + CHART_H / 2}) rotate(-90)`} textAnchor="middle"
          style={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
          EMOTION SHARE
        </text>
      </svg>
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <svg width={svgW - YAXIS_W} height={svgH} style={{ display: 'block', minWidth: '100%' }}>
          {[0, 0.25, 0.5, 0.75, 1].map(v => {
            const y = PAD_T + CHART_H - v * CHART_H;
            return (
              <line key={v} x1={0} y1={y} x2="100%" y2={y}
                stroke="var(--rule)" strokeWidth={v === 0 || v === 1 ? 1 : 0.5}
                strokeDasharray={v === 0 || v === 1 ? 'none' : '3 3'} />
            );
          })}
          {trend.map((d, i) => {
            const total = Object.values(d.moods || {}).reduce((a, b) => a + b, 0);
            const x = i * (BAR_W + GAP);
            if (!total) {
              return (
                <rect key={i} x={x} y={PAD_T} width={BAR_W} height={CHART_H}
                  fill="none" stroke="var(--rule)" strokeWidth={0.5} opacity={0.4} />
              );
            }
            let cumY = PAD_T + CHART_H;
            return emotions.map((e, ei) => {
              const count = d.moods?.[e] || 0;
              if (!count) return null;
              const segH = (count / total) * CHART_H;
              cumY -= segH;
              return (
                <rect key={e} x={x} y={cumY} width={BAR_W} height={segH}
                  fill={EMOTION_PALETTE[ei % EMOTION_PALETTE.length]} opacity={0.88}>
                  <title>{e}: {Math.round((count / total) * 100)}% on {d.day}</title>
                </rect>
              );
            });
          })}
          {trend.map((d, i) => {
            if (i % tickEvery !== 0 && i !== n - 1) return null;
            const x = i * (BAR_W + GAP);
            return (
              <text key={i} x={x + BAR_W / 2} y={PAD_T - 6}
                textAnchor="middle"
                style={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'var(--font-display)' }}>
                {formatTick(d.day, granularity)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const EmotionalSpectrum = ({ moods }) => {
  if (!moods || moods.length === 0) return <div className="nm-meta" style={{ padding: 30 }}>Not enough mood data yet.</div>;
  
  // Format data for Radar Chart
  const data = moods.slice(0, 6).map(m => ({
    subject: m.mood.charAt(0).toUpperCase() + m.mood.slice(1),
    A: m.pct,
    fullMark: 100,
  }));

  return (
    <div style={{ height: 260, width: '100%', marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="var(--rule-soft)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--ink-2)', fontSize: 11, fontFamily: 'var(--font-display)' }} />
          <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
          <Radar name="Mood" dataKey="A" stroke="var(--teal)" fill="var(--teal)" fillOpacity={0.4} />
          <Tooltip 
            contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--rule)', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
            itemStyle={{ color: 'var(--teal)' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

const EmotionalBandwidth = ({ distribution }) => {
  if (!distribution || distribution.length === 0) return <div className="nm-meta" style={{ padding: 30 }}>No intensity data yet.</div>;

  return (
    <div style={{ height: 200, width: '100%', marginTop: 13 }}>
      <div style={{ overflow: 'auto', height: '100%' }}>
        <div style={{ minWidth: 500, minHeight: 220, height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={distribution} margin={{ top: 17, right: 10, left: 45, bottom: 25 }}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="intensity" tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Intensity (1-10)', position: 'insideBottom', offset: -10, fill: 'var(--ink-2)', fontSize: 12, fontWeight: 500 }} />
              <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Frequency (Days)', angle: -90, position: 'insideLeft', offset: -15, fill: 'var(--ink-2)', fontSize: 12, fontWeight: 500 }} />
              <Tooltip 
                contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--rule)', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [value, 'Frequency']}
                labelFormatter={(label) => `Intensity Level: ${label}`}
              />
              <Area type="monotone" dataKey="count" stroke="var(--accent)" fillOpacity={1} fill="url(#colorCount)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const CognitiveLoad = ({ trend, granularity }) => {
  const n = trend?.length || 0;
  if (!n) return <div className="nm-meta" style={{ padding: 30 }}>No data yet.</div>;

  const data = trend.map(d => ({
    name: formatTick(d.day, granularity),
    thoughts: d.count,
    intensity: d.avg_intensity || 0,
  }));

  return (
    <div style={{ height: 260, width: '100%', marginTop: 8 }}>
      <div style={{ overflow: 'auto', height: '100%' }}>
        <div style={{ minWidth: 600, minHeight: 280, height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 27, right: 20, left: 20, bottom: 40 }}>
              <defs>
                <linearGradient id="barColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="var(--surface-2)" stopOpacity={0.8}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Timeline', position: 'insideBottom', offset: -20, fill: 'var(--ink-2)', fontSize: 12, fontWeight: 500 }} />
              <YAxis yAxisId="left" tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Thought Volume', angle: -90, position: 'insideLeft', offset: -10, fill: 'var(--ink-2)', fontSize: 12, fontWeight: 500 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fill: 'var(--accent)', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Avg Intensity (1-10)', angle: -90, position: 'insideRight', offset: -10, fill: 'var(--accent)', fontSize: 12, fontWeight: 500 }} />
              <Tooltip 
                contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--rule)', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--ink-2)', paddingBottom: 10 }} verticalAlign="top" />
              <Bar yAxisId="left" dataKey="thoughts" name="Thoughts (Count)" fill="url(#barColor)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="intensity" name="Intensity (Scale)" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface-0)' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const RANGES = [
  { k: '7d', d: 7 },
  { k: '30d', d: 30 },
  { k: '90d', d: 90 },
  { k: '1y', d: 365 },
];

const GRANULARITY_LABELS = { day: 'Today', week: 'This week', month: 'This month' };

export const InsightsScreen = () => {
  const [rangeKey, setRangeKey] = useState('30d');
  const [granularity, setGranularity] = useState('month');
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

  // Slice emotion_trend to the granularity window
  const visibleTrend = useMemo(() => {
    const window = GRANULARITY_WINDOW[granularity] ?? 30;
    const sliced = sliceLast(insights?.emotion_trend, window);
    const firstDataIdx = sliced.findIndex(d => d.count > 0);
    if (firstDataIdx === -1) return sliced;
    return sliced.slice(firstDataIdx);
  }, [insights, granularity]);

  // Slice each trigger row's intensity cells to the granularity window
  const visibleHeatmap = useMemo(() => {
    const window = GRANULARITY_WINDOW[granularity] ?? 30;
    return sliceHeatmap(insights?.trigger_heatmap, window);
  }, [insights, granularity]);

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
  const masteryPct = insights?.loops?.mastery_pct ?? 0;
  
  const coreBeliefs = insights?.core_beliefs_profile || [];
  const topCoreThemes = insights?.top_core_themes || [];
  const peakSummary = insights?.intensity_stats?.peak_summary;
  const lowSummary = insights?.intensity_stats?.low_summary;

  return (
    <div className="nm-main">
      <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Insights</b></>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={granularity}
            onChange={(e) => {
              const val = e.target.value;
              setGranularity(val);
              setRangeKey(val === 'week' ? '7d' : '30d');
            }}
            style={{
              background: 'var(--surface-2, var(--ink-6))',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              color: 'var(--ink)',
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              padding: '4px 10px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </TopBar>

      <div className="nm-content">
        <div style={{ maxWidth: 1080, margin: '0 auto' }} className="nm-fade-up">
          <header className="nm-hero">
            <div>
              <h1 className="nm-h1">
                {totalEntries === 0 ? <>A blank window —<br /><em>begin reflecting</em>.</> : <>The shape of your <em>{days <= 7 ? 'week' : days <= 30 ? 'month' : 'season'}</em>.</>}
              </h1>
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

          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 14 }}>
            {/* Emotion Trend card */}
            <div className="nm-card" style={{ overflow: 'hidden' }}>
              <div style={{ marginBottom: 14 }}>
                <div className="nm-eyebrow">Emotion Trend · <span style={{ color: 'var(--ink-2)' }}>{GRANULARITY_LABELS[granularity]}</span></div>
                <div className="nm-h3" style={{ marginTop: 4 }}>
                  {totalEntries === 0 ? 'Start reflecting to see your trend.' : 'Emotions over time'}
                </div>
                <EmotionMixBars
                  trend={visibleTrend}
                  granularity={granularity}
                  emotions={moods.slice(0, 6).map(m => m.mood)}
                />
                <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                  {moods.slice(0, 6).map((m, mi) => (
                    <div key={m.mood} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                      <span style={{ width: 9, height: 9, background: EMOTION_PALETTE[mi % EMOTION_PALETTE.length], borderRadius: 2, flexShrink: 0 }} />
                      <span>{m.mood}</span>
                      <span className="nm-meta">{m.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Cognitive Load card */}
            <div className="nm-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 14 }}>
                <div className="nm-eyebrow">Cognitive Load · <span style={{ color: 'var(--ink-2)' }}>{GRANULARITY_LABELS[granularity]}</span></div>
                <div className="nm-h3" style={{ marginTop: 4 }}>Thought Volume vs. Intensity</div>
                <CognitiveLoad trend={visibleTrend} granularity={granularity} />
              </div>
            </div>

            {/* Emotional Spectrum card */}
            <div className="nm-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 14 }}>
                <div className="nm-eyebrow">The Emotional Spectrum</div>
                <div className="nm-h3" style={{ marginTop: 4 }}>Your emotional shape</div>
                <EmotionalSpectrum moods={moods} />
              </div>
            </div>
          </div>

          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14, marginBottom: 14 }}>
            {/* Emotional Bandwidth card */}
            <div className="nm-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 14 }}>
                <div className="nm-eyebrow">Emotional Bandwidth</div>
                <div className="nm-h3" style={{ marginTop: 4 }}>Intensity Distribution</div>
                <EmotionalBandwidth distribution={insights?.intensity_distribution} />
              </div>
            </div>

            {/* Growth & Awareness card */}
            <div className="nm-card" style={{ display: 'flex', flexDirection: 'column', background: 'linear-gradient(145deg, var(--surface-1), var(--surface-2))', border: '1px solid var(--rule-soft)' }}>
              <div className="nm-eyebrow" style={{ marginBottom: 16 }}>Growth & Awareness</div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                
                {/* Embedded KPI 1: Emotional State */}
                <div style={{ background: 'var(--surface-0)', padding: 16, borderRadius: 8, border: '1px solid var(--rule-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div className="nm-meta" style={{ marginBottom: 6 }}>Dominant State</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>
                        {moods[0] ? moods[0].mood.charAt(0).toUpperCase() + moods[0].mood.slice(1) : '—'}
                      </div>
                      {moods[0] && <div className="nm-meta" style={{ color: 'var(--ink-3)' }}>({moods[0].pct}%)</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="nm-meta" style={{ marginBottom: 6 }}>Avg Intensity</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>{growthCur?.avg_intensity ?? '—'}</div>
                      {intensityDelta != null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: intensityDelta <= 0 ? 'var(--teal)' : 'var(--accent)' }}>
                          {intensityDelta <= 0 ? '↓ Calming' : '↑ Elevating'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Embedded KPI 2: Core Beliefs Profile */}
                <div style={{ background: 'var(--surface-0)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--rule-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="nm-meta">Core Beliefs Profile</div>
                  {coreBeliefs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {coreBeliefs.slice(0, 3).map((belief, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13, color: 'var(--ink)' }}>
                            {belief.belief}
                          </div>
                          <div style={{ width: 40, height: 4, background: 'var(--rule-soft)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${belief.pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="nm-meta" style={{ fontStyle: 'italic', fontSize: 12 }}>Not enough data to profile core beliefs.</div>
                  )}
                </div>

                {/* Embedded KPI 3: Pattern Mastery */}
                <div style={{ background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(108, 92, 231, 0.15))', padding: 16, borderRadius: 8, border: '1px solid var(--rule-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div className="nm-meta" style={{ marginBottom: 6 }}>Pattern Mastery</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{masteryPct}%</div>
                        <div className="nm-meta" style={{ color: 'var(--ink-3)' }}>resolved</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                      {loopsResolved} resolved / {loopsActive + loopsResolved} total loops
                    </div>
                  </div>
                  <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--surface-0)', border: '2px solid var(--teal)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 4px 12px rgba(78, 205, 196, 0.2)' }}>
                    {masteryPct === 100 ? '✧' : '∞'}
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="nm-card" style={{ marginBottom: 14 }}>
            <div style={{ marginBottom: 14 }}>
              <div className="nm-eyebrow">Trigger heatmap · <span style={{ color: 'var(--ink-2)' }}>{GRANULARITY_LABELS[granularity]}</span></div>
            </div>
            <TriggerHeat heatmap={visibleHeatmap} granularity={granularity} />
          </div>

          {false && /* Discovered Patterns, Subconscious Themes, Month in Extremes — hidden for now */ (
          <div className="nm-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Discovered Patterns */}
            <div className="nm-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="nm-eyebrow" style={{ marginBottom: 16 }}>Discovered Patterns</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <LoopSummary loops={loops} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="nm-card" style={{ background: 'var(--surface-0)', border: '1px solid var(--rule-soft)' }}>
                <div className="nm-eyebrow" style={{ marginBottom: 12 }}>Subconscious Themes</div>
                {topCoreThemes.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {topCoreThemes.map((t, i) => (
                      <div key={i} style={{ padding: '6px 12px', background: 'var(--surface-1)', borderRadius: 20, border: '1px solid var(--rule)', fontSize: 13, color: 'var(--ink)' }}>
                        {t.theme}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="nm-meta" style={{ fontStyle: 'italic' }}>Not enough data to extract themes.</div>
                )}
              </div>

              <div className="nm-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg, rgba(78, 205, 196, 0.05), rgba(108, 92, 231, 0.05))', border: '1px solid var(--rule-soft)' }}>
                <div className="nm-eyebrow" style={{ marginBottom: 16 }}>Month in Extremes</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1 }}>
                  <div style={{ background: 'var(--surface-0)', padding: 12, borderRadius: 8, border: '1px solid var(--accent)', borderOpacity: 0.3, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div className="nm-meta" style={{ color: 'var(--accent)' }}>Peak Intensity</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{peakDay ? formatShort(peakDay) : '—'}</div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', fontStyle: 'italic', lineHeight: 1.5, flex: 1 }}>
                      {peakSummary ? `"${peakSummary}"` : 'No summary available.'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface-0)', padding: 12, borderRadius: 8, border: '1px solid var(--teal)', borderOpacity: 0.3, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div className="nm-meta" style={{ color: 'var(--teal)' }}>Lowest Intensity</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{lowDay ? formatShort(lowDay) : '—'}</div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', fontStyle: 'italic', lineHeight: 1.5, flex: 1 }}>
                      {lowSummary ? `"${lowSummary}"` : 'No summary available.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {loading && totalEntries === 0 && (
            <div className="nm-meta" style={{ textAlign: 'center', marginTop: 24 }}>Loading insights…</div>
          )}
        </div>
      </div>
    </div>
  );
};

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
        <button className="nm-btn accent" onClick={() => window.print()}><Icon name="download" size={12} /> PDF</button>
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
