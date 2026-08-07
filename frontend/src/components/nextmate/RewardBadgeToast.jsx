import { useEffect, useState } from 'react';
import { Icon } from './Shell';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

const AUTO_DISMISS_MS = 5000;

// `badge` goes back to null the instant it's dismissed (the watcher shifts
// its queue), but useDelayedUnmount keeps this mounted a bit longer to play
// the exit animation -- so the badge being shown is kept in local state
// rather than read straight off the prop, the same way PromptPackPop holds
// onto its `prompt` through its own exit beat.
export const RewardBadgeToast = ({ badge, onDismiss }) => {
  const [displayed, setDisplayed] = useState(badge);
  const open = Boolean(badge);
  const mounted = useDelayedUnmount(open, 240);

  useEffect(() => {
    if (badge) setDisplayed(badge);
  }, [badge]);

  useEffect(() => {
    if (!badge) return undefined;
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [badge, onDismiss]);

  if (!mounted) return null;

  return (
    <div className={`nm-badge-toast ${open ? 'nm-slide-in' : 'nm-slide-out'}`} role="status">
      <div className="nm-badge-toast-icon">
        <Icon name={displayed?.icon || 'trophy'} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="nm-eyebrow" style={{ marginBottom: 2 }}>Milestone unlocked</div>
        <div className="nm-h3" style={{ fontSize: 14, marginBottom: 2 }}>{displayed?.title}</div>
        <div className="nm-badge-toast-desc">{displayed?.description}</div>
        {displayed?.points != null && (
          <div className="nm-badge-toast-desc" style={{ color: 'var(--accent-2)', marginTop: 2 }}>+{displayed.points} points</div>
        )}
      </div>
      <button type="button" className="nm-toast-close" onClick={onDismiss} aria-label="Dismiss">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
};
