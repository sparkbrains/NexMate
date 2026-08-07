import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { listRewards } from '../../lib/api';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { Icon } from './Shell';
import { AppContext } from '../../context';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const RewardsPanel = ({ open, onClose }) => {
  const { markRewardsSeen } = useContext(AppContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const mounted = useDelayedUnmount(open, 240);

  useEffect(() => {
    if (!open) return;
    markRewardsSeen();
    let cancelled = false;
    setLoading(true);
    listRewards()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { /* non-blocking — panel just shows nothing new */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  const badges = data?.badges || [];

  return createPortal(
    <>
      <div className="nm-rewards-scrim" onClick={onClose} />
      <div className={`nm-rewards-panel ${open ? 'nm-slide-in' : 'nm-slide-out'}`}>
        <div className="nm-rewards-head">
          <div>
            <div className="nm-eyebrow">Milestones</div>
            <h3 className="nm-h3" style={{ marginTop: 4 }}>
              {data ? `${data.unlocked_count} / ${data.total_count} unlocked` : 'Your badges'}
            </h3>
            {data && (
              <div className="nm-meta" style={{ marginTop: 2 }}>{data.points} points earned</div>
            )}
          </div>
          <button className="nm-btn ghost" onClick={onClose} title="Close" style={{ padding: 6 }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        {loading && !data && (
          <div className="nm-meta" style={{ padding: '16px 0' }}>Loading…</div>
        )}

        <div className="nm-badge-grid">
          {badges.map((b) => (
            <div key={b.key} className={`nm-badge-card${b.unlocked ? ' unlocked' : ''}`}>
              <div className="nm-badge-icon">
                <Icon name={b.unlocked ? b.icon : 'lock'} size={18} />
              </div>
              <div className="nm-badge-title">{b.title}</div>
              <div className="nm-badge-desc">{b.description}</div>
              <div className="nm-badge-points">+{b.points} pts</div>
              {b.unlocked && b.unlocked_at && (
                <div className="nm-badge-date">{fmtDate(b.unlocked_at)}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
};
