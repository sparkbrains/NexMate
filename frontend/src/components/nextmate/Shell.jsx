import { useContext, useState } from 'react';
import { AppContext } from '../../context';

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
    moon: <><path d="M12 9A5 5 0 115 2a7 7 0 007 7z" /></>,
    user: <><circle cx="8" cy="5.5" r="2.5" /><path d="M2.8 14a5.2 5.2 0 0110.4 0" /></>,
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

export const Sidebar = ({ active, onNav, threads = [], activeThreadId, onSelectThread, onNewThread, user, onLogout }) => {
  const { sidebarOpen, setSidebarOpen } = useContext(AppContext);
  const [threadTab, setThreadTab] = useState('regular'); // 'regular' | 'reflecting'

  const regularThreads = threads.filter(t => !t.loop_id);
  const reflectingThreads = threads.filter(t => t.loop_id);
  const activeThreads = threadTab === 'reflecting' ? reflectingThreads : regularThreads;

  return (
    <>
      {/* Mobile backdrop shadow when menu drawer is active */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 45 }} 
        />
      )}
      
      <aside className={"nm-side" + (sidebarOpen ? " open" : "")}>
        <div className="nm-brand">
          <div className="nm-brand-mark"><BrandMark /></div>
          <div className="nm-brand-name">next<em>mate</em></div>
          {/* Close button inside sidebar on mobile */}
          <button 
            className="nm-btn ghost nm-menu-btn" 
            style={{ marginLeft: 'auto', padding: 4 }} 
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <button className="nm-btn accent" onClick={onNewThread} style={{ justifyContent: 'center', padding: '10px 12px', fontSize: 13, marginBottom: 8 }}>
          <Icon name="plus" size={12} /> Begin a reflection
        </button>

        <div className="nm-nav-section">Workspace</div>
        <NavItem icon="home" label="Today" k="today" active={active} onNav={onNav} />
        <NavItem icon="book" label="Journal" k="journal" active={active} onNav={onNav} />
        <NavItem icon="loops" label="Loops" k="loops" active={active} onNav={onNav} />
        <NavItem icon="insights" label="Insights" k="insights" active={active} onNav={onNav} />


        <div className="nm-nav-section">Threads · {threads.length}</div>

        <div className="nm-thread-tabs">
          <button
            className={"nm-thread-tab" + (threadTab === 'regular' ? " active" : "")}
            onClick={() => setThreadTab('regular')}
          >
            Threads
            {regularThreads.length > 0 && <span className="nm-nav-count">{regularThreads.length}</span>}
          </button>
          <button
            className={"nm-thread-tab" + (threadTab === 'reflecting' ? " active" : "")}
            onClick={() => setThreadTab('reflecting')}
          >
            Reflecting on
            {reflectingThreads.length > 0 && <span className="nm-nav-count">{reflectingThreads.length}</span>}
          </button>
        </div>

        <div className="nm-threads">
          {activeThreads.length === 0 && (
            <div className="nm-meta" style={{ padding: '8px 12px' }}>
              {threadTab === 'reflecting' ? 'No reflections yet.' : 'No threads yet.'}
            </div>
          )}
          {activeThreads.map(t => {
            const isActive = t.thread_id === activeThreadId && active === 'chat';
            return (
              <div
                key={t.thread_id}
                className={"nm-thread" + (isActive ? " active" : "")}
                onClick={() => {
                  onSelectThread && onSelectThread(t.thread_id);
                  setSidebarOpen(false);
                }}
              >
                <div className="nm-thread-title">
                  {threadTab === 'reflecting'
                    ? (t.title || 'Untitled').replace(/^Reflecting on:\s*/, '')
                    : (t.title || 'Untitled')}
                </div>
                <div className="nm-thread-meta">{fmtWhen(t.updated_at)}</div>
              </div>
            );
          })}
        </div>

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
          {/* <button
            className="nm-btn ghost"
            onClick={(e) => { e.stopPropagation(); onLogout && onLogout(); }}
            title="Sign out"
            style={{ padding: 4 }}
          >
            <Icon name="close" size={13} />
          </button> */}
        </div>
      </aside>
    </>
  );
};

export const TopBar = ({ crumb, children }) => {
  const { theme, setTheme, setSidebarOpen } = useContext(AppContext);

  return (
    <div className="nm-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Hamburger Menu Toggle Button (visible on mobile viewports) */}
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
        {/* Global Dark/Light Theme Toggle Button */}
        <button 
          className="nm-btn ghost" 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          style={{ padding: 8, borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
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