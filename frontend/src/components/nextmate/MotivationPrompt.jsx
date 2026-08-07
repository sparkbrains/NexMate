import { useEffect, useState } from 'react';
import { Icon } from './Shell';
import { StepDots } from './ProfilePrompts';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

const PRESETS = [
  { key: 'companion', label: 'A companion to talk to', icon: 'user' },
  { key: 'manage-stress', label: 'Manage my thoughts and stress', icon: 'loops' },
  { key: 'untangle', label: 'Untangle a recurring thought', icon: 'patterns' },
];

export const MotivationPrompt = ({ open, steps, onSubmit, onSkip, saving, error }) => {
  const [picked, setPicked] = useState(null); // preset key, 'custom', or null
  const [customValue, setCustomValue] = useState('');
  const mounted = useDelayedUnmount(open, 260);

  // A failed save shouldn't leave the preset buttons permanently disabled —
  // but if the failure happened on the custom form, leave it open so
  // whatever the user typed isn't lost.
  useEffect(() => {
    if (error && picked !== 'custom') setPicked(null);
  }, [error, picked]);

  if (!mounted) return null;

  const choosePreset = (label, key) => {
    if (picked !== null) return;
    setPicked(key);
    // Let the pressed state register before handing off, same beat as the
    // journaled-before question.
    setTimeout(() => onSubmit(label), 260);
  };

  const submitCustom = (e) => {
    e.preventDefault();
    const trimmed = customValue.trim();
    if (!trimmed || saving) return;
    onSubmit(trimmed);
  };

  const showingCustomForm = picked === 'custom';

  return (
    <div className={`nm-pp-overlay ${open ? 'nm-in' : 'nm-out'}`}>
      <div className={`nm-onboard-card ${open ? 'nm-pop-in' : 'nm-pop-out'}`}>
        <button type="button" className="nm-onboard-skip" onClick={onSkip} disabled={saving || (picked !== null && !showingCustomForm)}>
          Skip
        </button>
        {steps && <StepDots steps={steps} />}
        <div className="nm-onboard-icon nm-icon-pop" style={{ marginBottom: 14 }}>
          <Icon name="sparkle" size={18} />
        </div>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Almost there</div>
        <h2 className="nm-h2" style={{ marginBottom: 10 }}>What brings you to Nextmate?</h2>
        <p className="nm-body" style={{ marginBottom: 22 }}>
          Pick whatever's closest — it just helps us understand what you're looking for.
        </p>

        {!showingCustomForm ? (
          <div className="nm-onboard-choices">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`nm-btn${picked === p.key ? ' primary picked' : ' ghost'}`}
                onClick={() => choosePreset(p.label, p.key)}
                disabled={picked !== null}
              >
                <Icon name={p.icon} size={14} /> {p.label}
              </button>
            ))}
            <button
              type="button"
              className="nm-btn ghost"
              onClick={() => setPicked('custom')}
              disabled={picked !== null}
            >
              <Icon name="edit" size={14} /> Something else
            </button>
            {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginTop: 4 }}>{error}</div>}
          </div>
        ) : (
          <form onSubmit={submitCustom}>
            <div className="nm-field" style={{ marginBottom: error ? 10 : 22 }}>
              <label htmlFor="nm-motivation-custom" className="nm-field-label">In your words</label>
              <input
                id="nm-motivation-custom"
                className="nm-field-input"
                type="text"
                autoFocus
                placeholder="whatever brought you here"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                maxLength={300}
              />
              <span className="nm-field-mark" />
            </div>
            {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 14 }}>{error}</div>}
            <button
              className="nm-btn primary"
              type="submit"
              disabled={!customValue.trim() || saving}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {saving ? 'Saving…' : "That's it"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
