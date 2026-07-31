import { useEffect, useState } from 'react';
import { Icon, TopBar } from './Shell';
import { getAllPromptPacks } from '../../lib/api';

const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const titleCase = (s) => (s ? s.replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : s);

const PromptCard = ({ prompt }) => {
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
    <div className="nm-pp2-card bright">
      <div className="nm-pp2-q">{prompt.prompt_text}</div>
      <div className="nm-pp2-a">{prompt.answer_text}</div>
      {prompt.answered_date && (
        <div className="nm-pp2-date">Answered {fmtDate(prompt.answered_date)}</div>
      )}
    </div>
  );
};

const CategoryAccordion = ({ category, prompts, defaultOpen }) => {
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
            <PromptCard key={p.prompt_id} prompt={p} />
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
      <TopBar crumb={<><b>Prompt Packs</b></>} />
      <div className="nm-journal-container">
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
              <CategoryAccordion key={c.category} category={c.category} prompts={c.prompts} defaultOpen={i === 0} />
            ))}
          </>
        )}
      </div>
    </div>
  );
};