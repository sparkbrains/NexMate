import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

const HOLE_PAD = 8;
const NOT_FOUND_TIMEOUT = 2600;

// Spotlights a single data-tour="…" element: dims the rest of the screen,
// draws a pulsing ring around the target, and anchors a small arrowed
// callout (title/body/step dots/Back·Next·Skip) beside it. Auto-advances
// past any step whose target never shows up (e.g. an empty journal with no
// active book yet) instead of getting stuck.
export const TourSpotlight = ({ open, steps, stepIndex, onNext, onBack, onSkip }) => {
  const mounted = useDelayedUnmount(open, 200);
  const [rect, setRect] = useState(null);
  const [calloutPos, setCalloutPos] = useState(null);
  const calloutRef = useRef(null);
  const notFoundSinceRef = useRef(null);
  const step = steps?.[stepIndex] || null;

  useEffect(() => {
    notFoundSinceRef.current = null;
    if (!open || !step) {
      setRect(null);
      return undefined;
    }

    let scrolledOnce = false;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) {
        if (notFoundSinceRef.current == null) {
          notFoundSinceRef.current = Date.now();
        } else if (Date.now() - notFoundSinceRef.current > NOT_FOUND_TIMEOUT) {
          notFoundSinceRef.current = null;
          onNext();
        }
        setRect(null);
        return;
      }
      notFoundSinceRef.current = null;
      if (!scrolledOnce) {
        scrolledOnce = true;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    const id = setInterval(measure, 120);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step?.target]);

  useLayoutEffect(() => {
    if (!rect) {
      setCalloutPos(null);
      return;
    }
    const calloutEl = calloutRef.current;
    const cw = calloutEl?.offsetWidth || 300;
    const ch = calloutEl?.offsetHeight || 150;
    const margin = 16;
    const gap = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const spaceRight = vw - (rect.left + rect.width);
    const spaceLeft = rect.left;

    let side = step?.placement || 'bottom';
    if (side === 'bottom' && spaceBelow < ch + gap && spaceAbove > spaceBelow) side = 'top';
    else if (side === 'top' && spaceAbove < ch + gap && spaceBelow > spaceAbove) side = 'bottom';
    else if (side === 'right' && spaceRight < cw + gap && spaceLeft > spaceRight) side = 'left';
    else if (side === 'left' && spaceLeft < cw + gap && spaceRight > spaceLeft) side = 'right';

    let top, left;
    if (side === 'top') {
      top = rect.top - ch - gap;
      left = rect.left + rect.width / 2 - cw / 2;
    } else if (side === 'bottom') {
      top = rect.top + rect.height + gap;
      left = rect.left + rect.width / 2 - cw / 2;
    } else if (side === 'left') {
      left = rect.left - cw - gap;
      top = rect.top + rect.height / 2 - ch / 2;
    } else {
      left = rect.left + rect.width + gap;
      top = rect.top + rect.height / 2 - ch / 2;
    }

    left = Math.min(Math.max(left, margin), Math.max(margin, vw - cw - margin));
    top = Math.min(Math.max(top, margin), Math.max(margin, vh - ch - margin));

    setCalloutPos({ top, left, side });
  }, [rect, step]);

  if (!mounted || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    <div className="nm-spotlight-root">
      <div className="nm-spotlight-blocker" />
      {rect && (
        <div
          className="nm-spotlight-hole"
          style={{
            top: rect.top - HOLE_PAD,
            left: rect.left - HOLE_PAD,
            width: rect.width + HOLE_PAD * 2,
            height: rect.height + HOLE_PAD * 2,
          }}
        />
      )}
      {rect && calloutPos && (
        <div
          ref={calloutRef}
          className={`nm-spotlight-callout nm-spotlight-${calloutPos.side} nm-fade-up`}
          style={{ top: calloutPos.top, left: calloutPos.left }}
        >
          <div className="nm-spotlight-arrow" />
          <div className="nm-eyebrow" style={{ marginBottom: 8 }}>{step.eyebrow}</div>
          <div className="nm-h3" style={{ marginBottom: 6 }}>{step.title}</div>
          <p className="nm-body" style={{ marginBottom: 16 }}>{step.body}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="nm-onboard-progress" style={{ marginBottom: 0, flex: 1 }}>
              {steps.map((_, i) => (
                <span key={i} className={`nm-onboard-dot${i === stepIndex ? ' current' : i < stepIndex ? ' done' : ''}`} />
              ))}
            </div>
            {!isFirst && (
              <button type="button" className="nm-btn ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={onBack}>
                Back
              </button>
            )}
            <button type="button" className="nm-btn primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={onNext}>
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
          <button type="button" className="nm-spotlight-skip" onClick={onSkip}>Skip tour</button>
        </div>
      )}
    </div>,
    document.body,
  );
};
