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

  // change-password modal state
  const [pwModal, setPwModal] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwErr, setPwErr] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  // delete-account modal state
  const [delModal, setDelModal] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delErr, setDelErr] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwErr('New passwords do not match.'); return; }
    if (newPw.length < 6) { setPwErr('Password must be at least 6 characters.'); return; }
    setPwLoading(true); setPwErr(null);
    try {
      await changePassword(currentPw, newPw);
      onLogout && onLogout();
    } catch (e) {
      setPwErr(e.message || 'Failed to change password.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDelLoading(true); setDelErr(null);
    try {
      await deleteAccount(delPw);
      onLogout && onLogout();
    } catch (e) {
      setDelErr(e.message || 'Failed to delete account.');
    } finally {
      setDelLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMe();
        if (!cancelled) setUser(data.user);
        const summaryData = await getUserProfileSummary();
        if (!cancelled) { setSummary(summaryData.summary); setSummaryLoading(false); }
      } catch {
        if (!cancelled) { setErr("Couldn't refresh your details — showing what we last had."); setSummaryLoading(false); }
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

          <div className="nm-eyebrow" style={{ marginBottom: 14 }}>Your Summary</div>
          <div className="nm-card soft" style={{ padding: '12px 24px', marginBottom: 24 }}>
            {summaryLoading ? 'Loading...' : (summary || 'Answer a few daily prompts and your summary will appear here.')}
          </div>

          <div className="nm-eyebrow" style={{ marginBottom: 14 }}>
            Account Actions
          </div>

          <div className="nm-card soft" style={{ padding: '16px 24px', marginBottom: 24, display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setPwModal(true); setPwErr(null); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#7c6ff7,#5ba4f5)', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}
            >
              <Icon name="settings" size={13} /> Change Password
            </button>
            <button
              onClick={() => { setDelModal(true); setDelErr(null); setDelPw(''); }}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#c0392b', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}
            >
              <Icon name="trash" size={13} /> Delete Account
            </button>
          </div>

          {/* Change Password Modal */}
          {pwModal && (
            <div onClick={() => setPwModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div className="nm-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, width: '100%', padding: 24 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Change Password</div>
                <form onSubmit={handleChangePassword}>
                  {[['Current password', currentPw, setCurrentPw], ['New password', newPw, setNewPw], ['Confirm new password', confirmPw, setConfirmPw]].map(([label, val, setter]) => (
                    <div key={label} style={{ marginBottom: 14 }}>
                      <div className="nm-tag" style={{ marginBottom: 6 }}>{label}</div>
                      <input
                        type="password"
                        value={val}
                        onChange={e => setter(e.target.value)}
                        required
                        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2, var(--ink-6))', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '8px 10px', outline: 'none' }}
                      />
                    </div>
                  ))}
                  {pwErr && <div style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 12 }}>{pwErr}</div>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="nm-btn ghost" onClick={() => setPwModal(false)}>Cancel</button>
                    <button type="submit" className="nm-btn accent" disabled={pwLoading}>{pwLoading ? 'Saving…' : 'Save'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete Account Modal */}
          {delModal && (
            <div onClick={() => setDelModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div className="nm-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, width: '100%', padding: 24 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Delete Account</div>
                <div className="nm-body" style={{ marginBottom: 20 }}>This permanently deletes your account and all data. Enter your password to confirm.</div>
                <form onSubmit={handleDeleteAccount}>
                  <div style={{ marginBottom: 14 }}>
                    <div className="nm-tag" style={{ marginBottom: 6 }}>Password</div>
                    <input
                      type="password"
                      value={delPw}
                      onChange={e => setDelPw(e.target.value)}
                      required
                      style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2, var(--ink-6))', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 14, padding: '8px 10px', outline: 'none' }}
                    />
                  </div>
                  {delErr && <div style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 12 }}>{delErr}</div>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="nm-btn ghost" onClick={() => setDelModal(false)}>Cancel</button>
                    <button type="submit" className="nm-btn" disabled={delLoading} style={{ color: 'var(--accent)' }}>{delLoading ? 'Deleting…' : 'Delete my account'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <button
              type="button"
              onClick={onLogout}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#7c6ff7', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}
            >
              <Icon name="logout" size={13} /> Sign out
            </button>
          </div>

          <div style={{ textAlign: 'center', width: '100%', display: 'block', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7 }}>
            Nextmate keeps 90 days of memory.<br />
            It doesn't provide clinical advice — it reflects.
          </div>
        </div>
      </div>
    </div>
  );
}