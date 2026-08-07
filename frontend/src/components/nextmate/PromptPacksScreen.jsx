import { useEffect, useState } from 'react';
import { Icon, TopBar } from './Shell';
import { getAllPromptPacks } from '../../lib/api';

const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const titleCase = (s) => (s ? s.replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : s);

const PromptCard = ({ prompt, category, onSelect }) => {
  if (!prompt.answered) {
    return (
      <div className="nm-pp2-card dull">
        <div className="nm-pp2-blur">
          <div className="nm-pp2-q">{prompt.prompt_text}</div>
        </div>
        <div className="nm-pp2-lockover">
          <div className="nm-pp2-lock-ic"><Icon name="lock" size={16} /></div>
          <div className="nm-pp2-cooking">Be patient, something is cooking</div>
        </div>
      </div>
    );
  }
  return (
    <div className="nm-pp2-card bright" onClick={() => onSelect && onSelect(prompt)} style={{ cursor: 'pointer' }}>
      <div className="nm-pp2-q">{prompt.prompt_text}</div>
      <div className="nm-pp2-a">{prompt.answer_text}</div>
      {prompt.answered_date && (
        <div className="nm-pp2-date">Answered {fmtDate(prompt.answered_date)}</div>
      )}
    </div>
  );
};

const CategoryAccordion = ({ category, prompts, defaultOpen, onSelectPrompt }) => {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const answeredCount = prompts.filter((p) => p.answered).length;

  return (
    <div className="nm-pp2-group">
      <button className="nm-pp2-group-head" onClick={() => setOpen((o) => !o)}>
        <span className="nm-pp2-group-chevron" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span className="nm-pp2-group-title">{titleCase(category)}</span>
        <span className="nm-meta" style={{ marginLeft: 'auto' }}>{answeredCount}/{prompts.length}</span>
      </button>
      {open && (
        <div className="nm-pp2-grid">
          {prompts.map((p) => (
            <PromptCard key={p.prompt_id} prompt={p} category={category} onSelect={onSelectPrompt} />
          ))}
        </div>
      )}
    </div>
  );
};

export const PromptPacksScreen = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totals, setTotals] = useState({ total: 0, answered_count: 0 });
  const [selectedPrompt, setSelectedPrompt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAllPromptPacks();
        if (cancelled) return;
        setCategories(data.categories || []);
        setTotals({ total: data.total || 0, answered_count: data.answered_count || 0 });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load prompt packs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="nm-main">
      <TopBar crumb={<><b>Discover Yourself</b></>} />
      <div className="nm-journal-container" style={{ overflowY: 'auto' }}>
        <div className="nm-journal-welcome">
          <div className="nm-journal-welcome-text">
            <h3>Every question, in one place.</h3>
            <p>Answered ones light up with what you said.<br />The rest are still cooking.</p>
          </div>
        </div>

        {loading && <div className="nm-meta" style={{ padding: 14 }}>Loading…</div>}
        {error && <div className="nm-meta" style={{ color: 'var(--accent)', padding: 14 }}>{error}</div>}

        {!loading && !error && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
              <div className="nm-eyebrow">All categories</div>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
              <div className="nm-meta">{totals.answered_count}/{totals.total} answered</div>
            </div>

            {categories.map((c, i) => (
              <CategoryAccordion 
                key={c.category} 
                category={c.category} 
                prompts={c.prompts} 
                defaultOpen={i === 0} 
                onSelectPrompt={setSelectedPrompt}
              />
            ))}
          </>
        )}
      </div>

      {selectedPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setSelectedPrompt(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 30, maxWidth: 600, width: '100%', boxShadow: '0 0 20px rgba(139, 92, 246, 0.3), 0 10px 40px rgba(0,0,0,0.4)', border: '2px solid #8b5cf6', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedPrompt(null)} style={{ position: 'absolute', top: 16, right: 16, background: '#fee2e2', border: '1px solid #f87171', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#dc2626' }}>
              <Icon name="x" size={16} />
            </button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', marginBottom: 16, lineHeight: 1.4, paddingRight: 24 }}>
              {selectedPrompt.prompt_text}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', marginBottom: 20 }}>
              {selectedPrompt.answer_text}
            </div>
            {selectedPrompt.answered_date && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--accent-2)' }}>
                Answered {fmtDate(selectedPrompt.answered_date)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};