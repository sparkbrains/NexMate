import { Icon } from './Shell';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

// A one-off celebration banner that drops in from the top once the user's
// opened every section of the first-run tour. Auto-dismisses itself — see
// useOnboardingTour — but can also be closed by hand.
export const TourCompleteToast = ({ open, onDismiss }) => {
  const mounted = useDelayedUnmount(open, 260);
  if (!mounted) return null;

  return (
    <div className={`nm-tour-complete ${open ? 'nm-drop-in' : 'nm-drop-out'}`} role="status">
      <div className="nm-onboard-icon nm-icon-pop" style={{ width: 32, height: 32 }}>
        <Icon name="sparkle" size={15} />
      </div>
      <div>
        <div className="nm-h3" style={{ marginBottom: 2 }}>That's the whole tour.</div>
        <p className="nm-body" style={{ margin: 0 }}>You know where everything is now. We'll be here.</p>
      </div>
      <button type="button" className="nm-toast-close" onClick={onDismiss} aria-label="Dismiss">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
};
