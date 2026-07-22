import { useEffect, useState } from 'react';
import { getUser, getMe } from '../../lib/api';
import { Icon, TopBar } from './Shell';

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMemberSince(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

// Rendered inside the main content area when the sidebar's "profile" nav
// is selected — sits alongside <Sidebar> the same way TodayScreen /
// JournalScreen / LoopsScreen do, using the same nm-main / nm-content
// wrapper classes so it takes the right-hand pane instead of the
// sidebar's column.
export function ProfilePage({ onLogout }) {
  const [user, setUser] = useState(() => getUser());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMe();
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setErr("Couldn't refresh your details — showing what we last had.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fields = [
    { label: 'Name', value: user?.name || '—' },
    { label: 'Email', value: user?.email || '—' },
    { label: 'Age', value: user?.age != null ? String(user.age) : '—' },
    { label: 'Member since', value: formatMemberSince(user?.created_at) },
    { label: 'Plan', value: user?.subscription_tier ? capitalize(user.subscription_tier) : '—' },
  ];

  return (
    <div className="nm-main">
      <TopBar crumb={<b>Profile</b>} />

      <div className="nm-content">
        <div style={{ maxWidth: 560, margin: '0 auto' }} className="nm-fade-up">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <div className="nm-avatar" style={{ width: 52, height: 52, fontSize: 20 }}>
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className="nm-h1" style={{ fontSize: 26 }}>
                {loading ? '···' : (user?.name || 'Your profile')}
              </h1>
              <div className="nm-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || ''}
              </div>
            </div>
          </div>

          <div className="nm-eyebrow" style={{ marginBottom: 14 }}>
            About you
          </div>

          <div className="nm-card soft" style={{ padding: '4px 24px', marginBottom: 24 }}>
            {fields.map((f, i) => (
              <div
                key={f.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 24,
                  padding: '16px 0',
                  borderBottom: i < fields.length - 1 ? '1px solid var(--rule-soft)' : 'none',
                }}
              >
                <span className="nm-tag" style={{ whiteSpace: 'nowrap' }}>{f.label}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, textAlign: 'right' }}>
                  {loading ? '···' : f.value}
                </span>
              </div>
            ))}
          </div>

          {err && (
            <p className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 20 }}>
              {err}
            </p>
          )}

          <div className="nm-eyebrow" style={{ marginBottom: 14 }}>
            Account Actions
          </div>

          <div className="nm-card soft" style={{ padding: '20px 24px', marginBottom: 24 }}>
            <button
              className="nm-btn"
              disabled
              title="Coming soon"
              style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 12, padding: '10px 12px', opacity: 0.45, cursor: 'not-allowed' }}
            >
              <Icon name="settings" size={14} /> Change Password
            </button>
            <button
              className="nm-btn"
              disabled
              title="Coming soon"
              style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--accent)', padding: '10px 12px', opacity: 0.45, cursor: 'not-allowed' }}
            >
              <Icon name="trash" size={14} /> Delete Account
            </button>
          </div>

          <button
            className="nm-btn"
            type="button"
            onClick={onLogout}
            style={{ justifyContent: 'center', width: '100%', padding: '10px 12px', marginBottom: 20 }}
          >
            <Icon name="close" size={13} /> Sign out
          </button>

          <div className="nm-meta" style={{ textAlign: 'center' }}>
            Nextmate keeps 90 days of memory.<br />
            It doesn't provide clinical advice — it reflects.
          </div>
        </div>
      </div>
    </div>
  );
}