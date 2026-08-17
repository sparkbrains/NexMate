import { Icon } from './Shell';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

const POINTS = [
  'We read what you write here — journal entries, chats, reflections — to find patterns and surface insights back to you.',
  'That analysis happens inside your Nextmate account. Your content isn’t sold, and it isn’t used to train models outside your own space.',
  'You can delete your account and everything in it at any time from your profile.',
];

export const ConsentPrompt = ({ open, onAccept, saving, error }) => {
  const mounted = useDelayedUnmount(open, 260);
  if (!mounted) return null;

  return (
    <div className={`nm-pp-overlay ${open ? 'nm-in' : 'nm-out'}`}>
      <div className={`nm-onboard-card ${open ? 'nm-pop-in' : 'nm-pop-out'}`}>
        <div className="nm-onboard-icon nm-icon-pop" style={{ marginBottom: 14 }}>
          <Icon name="lock" size={18} />
        </div>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Before we go any further</div>
        <h2 className="nm-h2" style={{ marginBottom: 10 }}>How Nextmate uses what you share</h2>
        <p className="nm-body" style={{ marginBottom: 16 }}>
          Nextmate reflects your own thinking back to you — which means it needs to actually look at it. Here's the short version:
        </p>
        <ul style={{ margin: '0 0 22px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {POINTS.map((point) => (
            <li key={point} className="nm-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span aria-hidden style={{ color: 'var(--accent)', fontWeight: 700, lineHeight: '1.5em' }}>•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 14 }}>{error}</div>}
        <button
          className="nm-btn primary"
          type="button"
          onClick={onAccept}
          disabled={saving}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {saving ? 'Saving…' : 'Accept & continue'}
        </button>
      </div>
    </div>
  );
};