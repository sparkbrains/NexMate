import { useState } from 'react';
import { Icon } from './Shell';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

export const OnboardingIntake = ({ open, userName, onAnswer, onSkip }) => {
  const [picked, setPicked] = useState(null);
  const mounted = useDelayedUnmount(open, 260);
  if (!mounted) return null;

  const choose = (value) => {
    if (picked !== null) return;
    setPicked(value);
    // Let the pressed state register before the card hands off to the
    // next step — a beat of feedback beats an instant, jarring swap.
    setTimeout(() => onAnswer(value), 260);
  };

  return (
    <div className={`nm-pp-overlay ${open ? 'nm-in' : 'nm-out'}`}>
      <div className={`nm-onboard-card ${open ? 'nm-pop-in' : 'nm-pop-out'}`}>
        <button type="button" className="nm-onboard-skip" onClick={onSkip} disabled={picked !== null}>
          Skip
        </button>
        <div className="nm-onboard-icon nm-icon-pop" style={{ marginBottom: 14 }}>
          <Icon name="sparkle" size={18} />
        </div>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>
          Welcome{userName ? `, ${userName}` : ''}
        </div>
        <h2 className="nm-h2" style={{ marginBottom: 10 }}>Have you journaled before?</h2>
        <p className="nm-body" style={{ marginBottom: 24 }}>
          No wrong answer — this just helps us frame things right. We'll point
          out what's what as you click around.
        </p>
        <div className="nm-onboard-choices">
          <button
            type="button"
            className={`nm-btn primary${picked === true ? ' picked' : ''}`}
            onClick={() => choose(true)}
            disabled={picked !== null}
          >
            <Icon name="book" size={14} /> Yes, I have
          </button>
          <button
            type="button"
            className={`nm-btn ghost${picked === false ? ' picked' : ''}`}
            onClick={() => choose(false)}
            disabled={picked !== null}
          >
            <Icon name="sparkle" size={14} /> No, this is new
          </button>
        </div>
      </div>
    </div>
  );
};
