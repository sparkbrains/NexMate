import { useRef } from 'react';
import { Icon } from './Shell';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { NUDGE_COPY, REFLECT_HYPE_COPY } from '../../lib/tourSteps';

// The lightweight beat between spotlight walkthroughs: no overlay, just a
// small card saying "click that pulsing thing over there" plus a Skip link.
// Shown for both the sidebar-nav nudges and the final Begin Reflection hype.
export const TourNudgeCard = ({ open, copyKey, onSkip }) => {
  const mounted = useDelayedUnmount(open, 240);
  const lastCopyKey = useRef(copyKey);
  if (open) lastCopyKey.current = copyKey;

  if (!mounted) return null;
  const content = lastCopyKey.current === 'reflect' ? REFLECT_HYPE_COPY : NUDGE_COPY[lastCopyKey.current];
  if (!content) return null;

  return (
    <div className={`nm-tour-card ${open ? 'nm-slide-in' : 'nm-slide-out'}`}>
      <div key={lastCopyKey.current} className="nm-fade-up" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span className="nm-nudge-arrow" style={{ color: 'var(--accent)', marginTop: 3, flexShrink: 0 }}>
          <Icon name="arrow" size={16} />
        </span>
        <div>
          <div className="nm-eyebrow" style={{ marginBottom: 6 }}>{content.eyebrow}</div>
          <div className="nm-h3" style={{ marginBottom: 6 }}>{content.title}</div>
          <p className="nm-body" style={{ marginBottom: 0 }}>{content.body}</p>
        </div>
      </div>
      <button type="button" className="nm-spotlight-skip" style={{ marginTop: 14 }} onClick={onSkip}>Skip tour</button>
    </div>
  );
};
