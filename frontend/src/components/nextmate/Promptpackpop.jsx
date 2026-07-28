import { useEffect, useState } from 'react';
import { getTodaysPrompt, answerPrompt } from '../../lib/api';

export const PromptPackPop = () => {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    (async () => {
      try {
        const data = await getTodaysPrompt({ signal: controller.signal });
        if (!cancelled) setPrompt(data);
      } catch {
        /* non-blocking — if this fails, just don't show the pop */
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, []);

  if (loading || !prompt || prompt.answered || dismissed) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await answerPrompt(prompt.prompt_id, trimmed);
      setPrompt((p) => ({ ...p, answered: true, answer_text: trimmed }));
    } catch (ex) {
      setError(ex.message || 'Couldn’t save that. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nm-pp-overlay">
      <div className="nm-pp-card nm-fade-up">
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>From today's prompt pack</div>
        <h2 className="nm-h3" style={{ marginBottom: 18, lineHeight: 1.4 }}>{prompt.prompt_text}</h2>

        <form onSubmit={handleSubmit}>
          <textarea
            className="nm-textarea"
            rows={4}
            autoFocus
            placeholder="Answer honestly — no one's grading this."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />

          {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginTop: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="nm-btn ghost"
              onClick={() => setDismissed(true)}
              disabled={saving}
            >
              Maybe later
            </button>
            <button
              type="submit"
              className="nm-btn primary"
              disabled={!answer.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save answer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};