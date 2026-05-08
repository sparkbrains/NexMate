import { useEffect, useMemo, useState } from 'react';
import { Icon, TopBar, LoopRing } from './Shell';
import { getLoop, listLoops, resolveLoop } from '../../lib/api';

const LoopItem = ({ loop, active, onClick }) => (
  <div onClick={onClick} style={{ padding: '10px 12px', borderRadius: 4, cursor: 'pointer', marginBottom: 1, background: active ? 'var(--surface)' : 'transparent', borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LoopRing strength={loop.strength} size={30} showLabel={false} resolved={loop.state === 'resolved'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontStyle: 'italic', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          "{loop.core_belief || loop.name}"
        </div>
        <div className="nm-meta" style={{ fontSize: 9.5, marginTop: 2 }}>
          {loop.occurrences}× {loop.trigger ? `· ${loop.trigger}` : ''}
        </div>
      </div>
    </div>
  </div>
);

const Constellation = ({ occ, resolved }) => {
  const w = 700, h = 240, cx = w / 2, cy = h / 2;
  const count = Math.max(1, occ || 1);
  const rng = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const color = resolved ? 'var(--teal)' : 'var(--accent)';
  const nodes = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + rng(i) * 0.5;
    const r = 55 + rng(i + 5) * 75;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.65 };
  });
  if (count >= 1) nodes[0] = { x: cx + 95, y: cy - 25 };
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', background: resolved ? 'var(--teal-soft)' : 'var(--accent-wash)' }}>
      {nodes.map((n, i) =>
        nodes.slice(i + 1).map((m, j) => {
          const d = Math.hypot(n.x - m.x, n.y - m.y);
          if (d > 140) return null;
          return <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke={color} strokeWidth="1" opacity={Math.max(0, 1 - d / 140) * 0.4} />;
        }),
      )}
      <circle cx={cx} cy={cy} r="24" fill="none" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <text x={cx} y={cy + 42} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="0.14em">CORE BELIEF</text>
      {nodes.map((n, i) => (
        <g key={i}>
          {i === 0 && <circle cx={n.x} cy={n.y} r="13" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />}
          <circle cx={n.x} cy={n.y} r={i === 0 ? 7 : 5} fill="var(--surface)" stroke={color} strokeWidth={i === 0 ? 2 : 1.2} />
        </g>
      ))}
      {nodes[0] && (
        <text x={nodes[0].x + 14} y={nodes[0].y + 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink)">latest</text>
      )}
    </svg>
  );
};

const StatCell = ({ label, value, sub, accent }) => (
  <div className="nm-card" style={{ padding: 18 }}>
    <div className="nm-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
    <div className="nm-numeral sm" style={{ color: accent ? 'var(--accent)' : 'var(--ink)' }}>{value}</div>
    {sub && <div className="nm-meta" style={{ marginTop: 8 }}>{sub}</div>}
  </div>
);

const FRow = ({ label, items, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)', gap: 12 }}>
    <div className="nm-tag" style={{ width: 120 }}>{label}</div>
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {items.length === 0 ? <span className="nm-meta">—</span> : items.map((i) => <span key={i} className="nm-chip">{i}</span>)}
    </div>
  </div>
);

const Occ = ({ date, text, mood, last, first }) => {
  let dateLabel = '';
  if (date) {
    try {
      const d = new Date(date);
      dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { dateLabel = date; }
  }
  return (
    <div style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--rule)' }}>
      <div style={{ width: 130, flexShrink: 0 }}>
        <div className="nm-meta" style={{ color: 'var(--ink-2)' }}>{dateLabel || '—'}</div>
        {first && <div className="nm-meta" style={{ fontSize: 9, color: 'var(--accent)' }}>first</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-serif)', fontSize: 14, lineHeight: 1.45 }}>
        {text ? `"${text}"` : <span className="nm-meta">no summary</span>}
      </div>
      {mood && (
        <div style={{ width: 90, flexShrink: 0, textAlign: 'right' }}>
          <span className="nm-chip" style={{ fontSize: 10 }}>{mood}</span>
        </div>
      )}
    </div>
  );
};

const formatShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const LoopsScreen = ({ onNav }) => {
  const [loops, setLoops] = useState([]);
  const [counts, setCounts] = useState({ total: 0, active: 0, resolved: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);
  const [resolving, setResolving] = useState(false);

  const fetchList = async (preserveId = null) => {
    setLoadingList(true);
    try {
      const data = await listLoops();
      const items = data.items || [];
      setLoops(items);
      setCounts({ total: data.total || 0, active: data.active || 0, resolved: data.resolved || 0 });
      const nextId = preserveId && items.find((l) => l.loop_id === preserveId)
        ? preserveId
        : items[0]?.loop_id || null;
      setSelectedId(nextId);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load loops');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setLoadingDetail(true);
    getLoop(selectedId)
      .then((data) => { if (!cancelled) setDetail(data.loop); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load loop'); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const activeLoops = useMemo(() => loops.filter((l) => l.state === 'active'), [loops]);
  const resolvedLoops = useMemo(() => loops.filter((l) => l.state === 'resolved'), [loops]);

  const handleResolve = async () => {
    if (!detail) return;
    setResolving(true);
    try {
      await resolveLoop(detail.loop_id);
      await fetchList(detail.loop_id);
    } catch (e) {
      setError(e.message || 'Failed to resolve loop');
    } finally {
      setResolving(false);
    }
  };

  if (loadingList) {
    return (
      <div className="nm-main">
        <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Loops</b></>} />
        <div className="nm-content">
          <div className="nm-meta" style={{ padding: 40, textAlign: 'center' }}>Loading loops…</div>
        </div>
      </div>
    );
  }

  if (loops.length === 0) {
    return (
      <div className="nm-main">
        <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Loops</b></>} />
        <div className="nm-content">
          <div className="nm-empty-poem">
            <div className="nm-eyebrow" style={{ marginBottom: 14 }}>Nothing has circled back — yet</div>
            <h1>The first loop is always <em>a surprise</em>.</h1>
            <p>
              When the same belief returns under a familiar trigger, Nextmate names it.
              Until then, keep reflecting.
            </p>
            {error && <p className="nm-meta" style={{ color: 'var(--accent)', marginTop: 14 }}>{error}</p>}
            <div style={{ marginTop: 28 }}>
              <button className="nm-btn primary" onClick={() => onNav && onNav('chat')}>
                <Icon name="plus" size={12} /> Begin reflection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const loop = detail;

  return (
    <div className="nm-main">
      <TopBar crumb={<>Patterns <span className="sep">/</span> <b>Loops</b></>}>
        <button className="nm-btn"><Icon name="search" size={12} /> Filter</button>
        <button className="nm-btn"><Icon name="download" size={12} /> Export</button>
      </TopBar>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--rule)', overflowY: 'auto', background: 'var(--paper)' }}>
          <div style={{ padding: '26px 22px 14px' }}>
            <div className="nm-eyebrow" style={{ marginBottom: 8 }}>Pattern library</div>
            <div className="nm-h2">{counts.total} loop{counts.total === 1 ? '' : 's'} tracked</div>
            <div className="nm-meta" style={{ marginTop: 4 }}>{counts.active} active · {counts.resolved} resolved</div>
          </div>
          <div style={{ padding: '0 12px 24px' }}>
            {activeLoops.length > 0 && (
              <>
                <div className="nm-eyebrow" style={{ padding: '10px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />Active
                </div>
                {activeLoops.map((l) => (
                  <LoopItem key={l.loop_id} loop={l} active={selectedId === l.loop_id} onClick={() => setSelectedId(l.loop_id)} />
                ))}
              </>
            )}
            {resolvedLoops.length > 0 && (
              <>
                <div className="nm-eyebrow" style={{ padding: '14px 10px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)' }} />Resolved
                </div>
                {resolvedLoops.map((l) => (
                  <LoopItem key={l.loop_id} loop={l} active={selectedId === l.loop_id} onClick={() => setSelectedId(l.loop_id)} />
                ))}
              </>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 44px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }} key={selectedId} className="nm-fade-up">
            {loadingDetail && !loop && (
              <div className="nm-meta" style={{ padding: 40, textAlign: 'center' }}>Loading…</div>
            )}
            {error && !loop && (
              <div className="nm-meta" style={{ color: 'var(--accent)' }}>{error}</div>
            )}
            {loop && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span className={'nm-chip ' + (loop.state === 'resolved' ? 'teal' : 'accent')}>
                    <span className="nm-dot" />{loop.state}
                  </span>
                  <span className="nm-tag">
                    first seen {formatShort(loop.first_detected_at)} · last {formatShort(loop.last_detected_at)}
                  </span>
                  {loop.thread_count > 1 && (
                    <span className="nm-tag">across {loop.thread_count} threads</span>
                  )}
                </div>

                <h1 className="nm-h1" style={{ marginBottom: 28, fontStyle: 'italic', color: loop.state === 'resolved' ? 'var(--ink-3)' : 'var(--ink)' }}>
                  "{loop.core_belief || loop.name}"
                </h1>

                {loop.description && (
                  <p className="nm-lede" style={{ marginBottom: 22 }}>{loop.description}</p>
                )}

                <div className="nm-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ padding: '18px 22px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div>
                      <div className="nm-eyebrow">Constellation</div>
                      <div className="nm-h3" style={{ marginTop: 4 }}>{loop.occurrences} occurrence{loop.occurrences === 1 ? '' : 's'} around a core belief</div>
                    </div>
                    <div className="nm-meta">{loop.valence || '—'}</div>
                  </div>
                  <Constellation occ={loop.occurrences} resolved={loop.state === 'resolved'} />
                </div>

                <div className="nm-grid-4 nm-stagger" style={{ marginBottom: 16 }}>
                  <StatCell label="Strength" value={loop.strength.toFixed(2)} accent={loop.state !== 'resolved'} />
                  <StatCell label="Occurrences" value={loop.occurrences} />
                  <StatCell label="Avg intensity" value={loop.avg_intensity ?? '—'} />
                  <StatCell
                    label="Span"
                    value={loop.span_days ? `${loop.span_days}d` : '—'}
                    sub={loop.first_detected_at ? `${formatShort(loop.first_detected_at)} → ${formatShort(loop.last_detected_at)}` : null}
                  />
                </div>

                <div className="nm-card" style={{ marginBottom: 16 }}>
                  <div className="nm-eyebrow" style={{ marginBottom: 14 }}>Extracted features</div>
                  <FRow label="Triggers" items={loop.triggers && loop.triggers.length ? loop.triggers : (loop.trigger ? [loop.trigger] : [])} />
                  <FRow label="Valence" items={loop.valence ? [loop.valence] : []} />
                  <FRow label="Dominant mood" items={loop.dominant_mood ? [loop.dominant_mood] : (loop.co_moods || []).map((m) => m.mood)} />
                  <FRow label="Co-occurs with" items={(loop.co_triggers || []).map((c) => c.trigger)} last />
                </div>

                {loop.suggestion && (
                  <div className="nm-card soft" style={{ marginBottom: 16 }}>
                    <div className="nm-eyebrow" style={{ marginBottom: 8 }}>Suggestion</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.45 }}>{loop.suggestion}</div>
                  </div>
                )}

                <div className="nm-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                    <div className="nm-eyebrow">Every time it showed up</div>
                    <div className="nm-meta">{loop.occurrences} moment{loop.occurrences === 1 ? '' : 's'}</div>
                  </div>
                  {(loop.entries || []).length === 0 && (
                    <div className="nm-meta">No matched entries stored yet for this loop.</div>
                  )}
                  {(loop.entries || []).map((o, i, arr) => (
                    <Occ
                      key={`${o.date}-${i}`}
                      date={o.date}
                      text={o.summary}
                      mood={o.mood}
                      first={i === arr.length - 1}
                      last={i === arr.length - 1}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 22 }}>
                  <button className="nm-btn accent" onClick={() => onNav && onNav('chat')}>
                    <Icon name="plus" size={12} /> Reflect on this loop
                  </button>
                  {loop.state !== 'resolved' && (
                    <button className="nm-btn" onClick={handleResolve} disabled={resolving}>
                      {resolving ? 'Marking…' : 'Mark resolved'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};