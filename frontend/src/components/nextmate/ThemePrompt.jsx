import { useEffect, useState } from 'react';
import { Icon } from './Shell';
import { StepDots } from './ProfilePrompts';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

const OPTIONS = [
  { key: 'light', label: 'Canvas', icon: 'sun' },
  { key: 'dark', label: 'Midnight', icon: 'moon' },
  { key: 'playful', label: 'Meadow', icon: 'sparkle' },
];

const THEME_ICON = { light: 'sun', dark: 'moon', playful: 'sparkle' };

// The last of the profile prompts. Picking an option previews it
// immediately (via onPreview, which flips the app's live theme) so the
// choice is felt, not just recorded, before it's saved to the account.
export const ThemePrompt = ({ open, steps, currentTheme, onPreview, onSubmit, onSkip, saving, error }) => {
  const [picked, setPicked] = useState(null);
  const mounted = useDelayedUnmount(open, 260);

  useEffect(() => {
    if (error) setPicked(null);
  }, [error]);

  if (!mounted) return null;

  const choose = (key) => {
    if (picked !== null) return;
    setPicked(key);
    onPreview && onPreview(key);
    setTimeout(() => onSubmit(key), 260);
  };

  return (
    <div className={`nm-pp-overlay ${open ? 'nm-in' : 'nm-out'}`}>
      <div className={`nm-onboard-card ${open ? 'nm-pop-in' : 'nm-pop-out'}`}>
        <button type="button" className="nm-onboard-skip" onClick={onSkip} disabled={picked !== null}>
          Skip
        </button>
        {steps && <StepDots steps={steps} />}
        <div className="nm-onboard-icon nm-icon-pop" style={{ marginBottom: 14 }}>
          <Icon name={THEME_ICON[currentTheme] || 'sun'} size={18} />
        </div>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>One last thing</div>
        <h2 className="nm-h2" style={{ marginBottom: 10 }}>Pick your look</h2>
        <p className="nm-body" style={{ marginBottom: 22 }}>
          Soft &amp; light Canvas, classic dark Midnight, or bright and playful Meadow — you can always switch later from the top bar.
        </p>
        <div className="nm-onboard-choices">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`nm-btn${picked === o.key ? ' primary picked' : ' ghost'}`}
              onClick={() => choose(o.key)}
              disabled={picked !== null}
            >
              <Icon name={o.icon} size={14} /> {o.label}
            </button>
          ))}
        </div>
        {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
};
