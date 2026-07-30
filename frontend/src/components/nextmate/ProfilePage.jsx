import { useEffect, useState } from 'react';
import { getUser, getMe, changePassword, deleteAccount, getUserProfileSummary } from '../../lib/api';
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
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [cpErr, setCpErr] = useState(null);
  const [cpLoading, setCpLoading] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [delErr, setDelErr] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    setCpErr(null);
    setCpLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      onLogout();
    } catch (error) {
      setCpErr(error.message || 'Failed to change password');
    } finally {
      setCpLoading(false);
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault();
    if (!window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      return;
    }
    setDelErr(null);
    setDelLoading(true);
    try {
      await deleteAccount(deletePassword);
      onLogout();
    } catch (error) {
      setDelErr(error.message || 'Failed to delete account');
    } finally {
      setDelLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMe();
        if (!cancelled) setUser(data.user);
        const summaryData = await getUserProfileSummary();
        if (!cancelled) {
          setSummary(summaryData.summary);
          setSummaryLoading(false);
        }
      } catch {
        if (!cancelled) {
          setErr("Couldn't refresh your details — showing what we last had.");
          setSummaryLoading(false);
        }
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
          {/* User Profile Summary */}
          <div className="nm-eyebrow" style={{ marginBottom: 14 }}>Your Summary</div>
          <div className="nm-card soft" style={{ padding: '12px 24px', marginBottom: 24 }}>
            {summaryLoading ? 'Loading...' : (summary || 'Answer a few daily prompts and your summary will appear here.')}
          </div>

          <div className="nm-eyebrow" style={{ marginBottom: 14 }}>
            Account Actions
          </div>

          <div className="nm-card soft" style={{ padding: '20px 24px', marginBottom: 24 }}>
            {!showChangePassword ? (
              <button
                className="nm-btn"
                onClick={() => setShowChangePassword(true)}
                style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 12, padding: '10px 12px' }}
              >
                <Icon name="settings" size={14} /> Change Password
              </button>
            ) : (
              <form onSubmit={handleChangePassword} style={{ marginBottom: 20 }}>
                <div style={{ marginBottom: 12, fontWeight: 500 }}>Change Password</div>
                {cpErr && <div className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 8 }}>{cpErr}</div>}
                <input
                  className="nm-input"
                  type="password"
                  placeholder="Current Password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  style={{ marginBottom: 8, width: '100%', boxSizing: 'border-box' }}
                />
                <input
                  className="nm-input"
                  type="password"
                  placeholder="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{ marginBottom: 12, width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="nm-btn primary" type="submit" disabled={cpLoading}>
                    {cpLoading ? 'Saving...' : 'Save'}
                  </button>
                  <button className="nm-btn" type="button" onClick={() => setShowChangePassword(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {!showDeleteAccount ? (
              <button
                className="nm-btn"
                onClick={() => setShowDeleteAccount(true)}
                style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--accent)', padding: '10px 12px' }}
              >
                <Icon name="trash" size={14} /> Delete Account
              </button>
            ) : (
              <form onSubmit={handleDeleteAccount} style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 12, fontWeight: 500, color: 'var(--accent)' }}>Delete Account</div>
                {delErr && <div className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 8 }}>{delErr}</div>}
                <input
                  className="nm-input"
                  type="password"
                  placeholder="Confirm Password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  style={{ marginBottom: 12, width: '100%', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="nm-btn" type="submit" disabled={delLoading} style={{ color: 'var(--accent)' }}>
                    {delLoading ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                  <button className="nm-btn" type="button" onClick={() => setShowDeleteAccount(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
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
            Nexmate keeps 90 days of memory.<br />
            It doesn't provide clinical advice — it reflects.
          </div>
        </div>
      </div>
    </div>
  );
}