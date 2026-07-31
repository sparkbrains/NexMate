import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../../context';
import LogoIco from '../../assets/ic_logo.svg';

export const Icon = ({ name, size = 14, style }) => {
  const P = {
    home: <><path d="M2 7l6-5 6 5v7H2z" /><path d="M6 14V9h4v5" /></>,
    thread: <><path d="M2 4h12M2 8h12M2 12h8" /></>,
    loops: <><path d="M8 2a6 6 0 106 6" /><path d="M14 4v4h-4" /></>,
    insights: <><path d="M2 13h12M4 10V7M7 10V4M10 10V6M13 10V3" /></>,
    weekly: <><rect x="2" y="3" width="12" height="11" rx="1" /><path d="M2 6h12M5 2v3M11 2v3" /></>,
    book: <><path d="M3 2h7a2 2 0 012 2v10H5a2 2 0 01-2-2V2z" /><path d="M3 2v10M6 5h4M6 8h4" /></>,
    trash: <><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></>,
    edit: <><path d="M2 14l1.5-4.5L11 2l3 3-6.5 6.5H2z" /></>,
    patterns: <><circle cx="5" cy="5" r="2" /><circle cx="11" cy="5" r="2" /><circle cx="5" cy="11" r="2" /><circle cx="11" cy="11" r="2" /></>,
    plus: <><path d="M8 3v10M3 8h10" /></>,
    search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></>,
    mic: <><rect x="6" y="2" width="4" height="8" rx="2" /><path d="M3.5 8a4.5 4.5 0 009 0M8 12.5V14" /></>,
    arrow: <><path d="M3 8h10M9 4l4 4-4 4" /></>,
    back: <><path d="M13 8H3M7 4L3 8l4 4" /></>,
    download: <><path d="M8 2v9M4 7l4 4 4-4M3 14h10" /></>,
    sparkle: <><path d="M8 2l1.2 3.8L13 7l-3.8 1.2L8 12l-1.2-3.8L3 7l3.8-1.2z" /></>,
    more: <><circle cx="3" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="13" cy="8" r="1" /></>,
    settings: <><circle cx="8" cy="8" r="2" /><path d="M8 2v2M8 12v2M14 8h-2M4 8H2M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4M12.2 12.2l-1.4-1.4M5.2 5.2L3.8 3.8" /></>,
    close: <><path d="M4 4l8 8M12 4L4 12" /></>,
    'chevron-left': <><path d="M10 12L6 8l4-4" /></>,
    'chevron-right': <><path d="M6 12l4-4-4-4" /></>,
    menu: <><path d="M2 4h12M2 8h12M2 12h12" /></>,
    sun: <><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" /></>,
    moon: <><path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 100 11A5.5 5.5 0 0013 9.5z" /></>,
    logout: <><rect x="2" y="4" width="9" height="10" rx="1" /><path d="M10 10l4-2-4-2M7 8h7" /></>,
    user: <><circle cx="8" cy="5.5" r="2.5" /><path d="M2.8 14a5.2 5.2 0 0110.4 0" /></>,
    lock: <><rect x="3.5" y="7" width="9" height="7" rx="1.2" /><path d="M5.5 7V4.8a2.5 2.5 0 015 0V7" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {P[name]}
    </svg>
  );
};

export const BrandMark = () => (
  <svg viewBox="0 0 22 22" width="22" height="22">
    <circle cx="11" cy="11" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 6v10M7 6l8 10M15 6v10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="15" cy="6" r="1.8" fill="var(--teal)" style={{ filter: 'drop-shadow(0 0 4px var(--teal))' }} />
  </svg>
);

// Shared "are you sure?" modal, used for anything destructive (thread
// deletion, journal entry deletion, etc). Renders nothing when closed.
export const ConfirmDialog = ({ open, title, body, confirmLabel = 'Delete', cancelLabel = 'Cancel', onConfirm, onCancel }) => {
  if (!open) return null;
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="nm-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 360, width: '100%', padding: 24 }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: body ? 8 : 20 }}>
          {title}
        </div>
        {body && (
          <div className="nm-body" style={{ marginBottom: 22 }}>
            {body}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="nm-btn ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="nm-btn accent" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const NavItem = ({ icon, label, k, active, onNav, count }) => (
  <button className={"nm-nav-item" + (active === k ? " active" : "")} onClick={() => onNav && onNav(k)}>
    <span className="nm-nav-ic"><Icon name={icon} /></span>
    <span>{label}</span>
    {count && <span className="nm-nav-count">{count}</span>}
  </button>
);

const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
};

export const Sidebar = ({ active, onNav, threads = [], activeThreadId, onSelectThread, onNewThread, onDeleteThread, user, onLogout }) => {
  const { sidebarOpen, setSidebarOpen } = useContext(AppContext);
  const [openSections, setOpenSections] = useState({ regular: true, reflecting: false, daily: false });
  const [pendingDeleteThread, setPendingDeleteThread] = useState(null);

  const isReflecting = (t) => Boolean(t.loop_id) || /^Reflecting on:/i.test(t.title || '');
  const isDailyQuestion = (t) => Boolean(t.daily_question_id) || /^Daily Question:/i.test(t.title || '');

  const dailyThreads = threads.filter(isDailyQuestion);
  const reflectingThreads = threads.filter(t => !isDailyQuestion(t) && isReflecting(t));
  const regularThreads = threads.filter(t => !isDailyQuestion(t) && !isReflecting(t));

  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const renderThreadList = (items, tab) => (
    <div className="nm-threads">
      {items.length === 0 && (
        <div style={{ padding: '6px 12px 10px', fontSize: 11.5, color: 'var(--ink-4)', fontWeight: 400, fontFamily: 'var(--font-sans)' }}>
          {tab === 'reflecting' ? 'No reflections yet.' : tab === 'daily' ? 'No answered daily questions yet.' : 'No threads yet.'}
        </div>
      )}
      {items.map(t => {
        const isActive = t.thread_id === activeThreadId && active === 'chat';
        return (
          <div
            key={t.thread_id}
            className={"nm-thread" + (isActive ? " active" : "")}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <div
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
              onClick={() => { onSelectThread && onSelectThread(t.thread_id); setSidebarOpen(false); }}
            >
              <div className="nm-thread-title">
                {tab === 'reflecting' ? (t.title || 'Untitled').replace(/^Reflecting on:\s*/, '') : (t.title || 'Untitled')}
              </div>
              <div className="nm-thread-meta">{fmtWhen(t.updated_at)}</div>
            </div>
            {onDeleteThread && (
              <button
                className="nm-btn ghost"
                style={{ padding: 3, flexShrink: 0, opacity: 0.5 }}
                title="Delete thread"
                onClick={(e) => { e.stopPropagation(); setPendingDeleteThread(t); }}
              >
                <Icon name="trash" size={11} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const SectionHeader = ({ label, sectionKey, count }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 4px', color: 'var(--accent-2)',
        fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}
    >
      <span style={{
        display: 'inline-block',
        transition: 'transform 0.2s',
        transform: openSections[sectionKey] ? 'rotate(90deg)' : 'rotate(0deg)',
        fontSize: 10,
      }}>▶</span>
      {label}
      {count > 0 && <span className="nm-nav-count" style={{ marginLeft: 'auto', color: 'var(--accent-2)' }}>{count}</span>}
    </button>
  );

  return (
    <>
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 45 }} />
      )}

      <aside className={"nm-side" + (sidebarOpen ? " open" : "")}>
        <div className="nm-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20 }}>
          <img src={LogoIco} alt="Nextmate" height={30} className="nm-logo" />
          <button className="nm-btn ghost nm-menu-btn" style={{ padding: 4 }} onClick={() => setSidebarOpen(false)}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <button className="nm-btn accent" style={{ width: '100%', marginBottom: 16 }} onClick={() => { onNewThread && onNewThread(); setSidebarOpen(false); }}>
          <Icon name="plus" size={12} /> Begin reflection
        </button>

        <div className="nm-nav-section">Workspace</div>
        <NavItem icon="home" label="Today" k="today" active={active} onNav={onNav} />
        <NavItem icon="book" label="Journal" k="journal" active={active} onNav={onNav} />
        <NavItem icon="sparkle" label="Prompt Packs" k="prompt-packs" active={active} onNav={onNav} />
        <NavItem icon="loops" label="Loops" k="loops" active={active} onNav={onNav} />
        <NavItem icon="insights" label="Insights" k="insights" active={active} onNav={onNav} />

        <div className="nm-nav-section" style={{ marginTop: 12 }}>Conversations</div>

        <SectionHeader label="Daily Conversation" sectionKey="regular" count={regularThreads.length} />
        {openSections.regular && renderThreadList(regularThreads, 'regular')}

        <SectionHeader label="Reflection" sectionKey="reflecting" count={reflectingThreads.length} />
        {openSections.reflecting && renderThreadList(reflectingThreads, 'reflecting')}

        <SectionHeader label="Daily Questions" sectionKey="daily" count={dailyThreads.length} />
        {openSections.daily && renderThreadList(dailyThreads, 'daily')}

        <div
          className={"nm-side-footer" + (active === 'profile' ? " active" : "")}
          role="button"
          tabIndex={0}
          onClick={() => {
            onNav && onNav('profile');
            setSidebarOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNav && onNav('profile');
              setSidebarOpen(false);
            }
          }}
          style={{ cursor: 'pointer' }}
          title="View profile"
        >
          <div className="nm-avatar">{(user?.name || user?.email || '?')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm-side-footer-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || user?.email || 'Signed out'}</div>
            <div className="nm-side-footer-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ? user?.email : 'signed in'}</div>
          </div>
          <button
            className="nm-btn ghost"
            onClick={(e) => { e.stopPropagation(); onLogout && onLogout(); }}
            title="Sign out"
            style={{ padding: 4, flexShrink: 0 }}
          >
            <Icon name="logout" size={14} />
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={Boolean(pendingDeleteThread)}
        title="Delete this thread?"
        body={
          pendingDeleteThread
            ? <>This removes every message in "{pendingDeleteThread.title || 'Untitled'}" and can't be undone. If it contributed to a detected pattern, that pattern will be updated or removed too.</>
            : null
        }
        confirmLabel="Delete thread"
        onCancel={() => setPendingDeleteThread(null)}
        onConfirm={() => {
          const t = pendingDeleteThread;
          setPendingDeleteThread(null);
          if (t) onDeleteThread && onDeleteThread(t.thread_id);
        }}
      />
    </>
  );
};

export const TopBar = ({ crumb, children }) => {
  const { setSidebarOpen, theme, setTheme } = useContext(AppContext);

  return (
    <div className="nm-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button 
          className="nm-btn ghost nm-menu-btn" 
          onClick={() => setSidebarOpen(true)}
          title="Open Menu"
          style={{ padding: 6 }}
        >
          <Icon name="menu" size={16} />
        </button>
        <div className="nm-crumb">{crumb}</div>
      </div>
      
      <div className="nm-top-actions">
        {children}
        <button
          className="nm-btn ghost"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ padding: 6, color: 'var(--ink)' }}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </div>
  );
};

export const LoopRing = ({ strength = 0.5, size = 72, showLabel = true, resolved }) => {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = resolved ? 'var(--teal)' : 'var(--accent)';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth="1.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={`${c * strength} ${c}`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        <circle cx={size / 2} cy={size / 2} r={r - 5} fill="none" stroke={color} strokeWidth="1" strokeDasharray={`${(c - 10) * strength * 0.6} ${c}`} opacity="0.25" />
      </svg>
      {showLabel && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.28, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>{strength.toFixed(2)}</div>
          <div className="nm-meta" style={{ fontSize: 8 }}>loop</div>
        </div>
      )}
    </div>
  );
};