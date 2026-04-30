// Shell — sidebar with threads, topbar, icons, loop ring

const Icon = ({ name, size = 14 }) => {
  const P = {
    home: <><path d="M2 7l6-5 6 5v7H2z" /><path d="M6 14V9h4v5" /></>,
    thread: <><path d="M2 4h12M2 8h12M2 12h8" /></>,
    loops: <><path d="M8 2a6 6 0 106 6" /><path d="M14 4v4h-4" /></>,
    insights: <><path d="M2 13h12M4 10V7M7 10V4M10 10V6M13 10V3" /></>,
    weekly: <><rect x="2" y="3" width="12" height="11" rx="1" /><path d="M2 6h12M5 2v3M11 2v3" /></>,
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
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {P[name]}
    </svg>
  );
};

// Logo — interlocked Ns forming a subtle loop
const BrandMark = () => (
  <svg viewBox="0 0 22 22" width="22" height="22">
    <circle cx="11" cy="11" r="10" fill="none" stroke="var(--ink)" strokeWidth="1.2" />
    <path d="M7 6v10M7 6l8 10M15 6v10" fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="15" cy="6" r="1.6" fill="var(--accent)" />
  </svg>
);

const Sidebar = ({ active, onNav }) => {
  const threads = [
    { id: 't1', title: 'The 9pm promise, again', meta: 'now · 12 msgs', loop: true, active: true },
    { id: 't2', title: 'Coffee with Jun', meta: 'yesterday · 6 msgs' },
    { id: 't3', title: 'Why I said yes to Priya', meta: '2d · 9 msgs', loop: true },
    { id: 't4', title: 'A run after standup', meta: '3d · 4 msgs' },
    { id: 't5', title: 'Mom called', meta: '5d · 11 msgs' },
    { id: 't6', title: 'Morning before the review', meta: '1w · 8 msgs', loop: true },
  ];

  return (
    <aside className="nm-side">
      <div className="nm-brand">
        <div className="nm-brand-mark"><BrandMark /></div>
        <div className="nm-brand-name">next<em>mate</em></div>
      </div>

      <button className="nm-btn accent" style={{ justifyContent: 'center', padding: '8px 12px', fontSize: 12.5, marginBottom: 4 }}>
        <Icon name="plus" size={12} /> Begin a reflection
      </button>

      <div className="nm-nav-section">Workspace</div>
      <NavItem icon="home" label="Today" k="today" active={active} onNav={onNav} />
      <NavItem icon="loops" label="Loops" k="loops" active={active} onNav={onNav} count="3 active" />
      <NavItem icon="insights" label="Insights" k="insights" active={active} onNav={onNav} />
      <NavItem icon="weekly" label="Weekly" k="weekly" active={active} onNav={onNav} />

      <div className="nm-nav-section">Threads · 247</div>
      <div className="nm-threads">
        {threads.map(t => (
          <div key={t.id} className={"nm-thread" + (t.loop ? " loop" : "") + (t.active && active === 'chat' ? " active" : "")} onClick={() => onNav('chat')}>
            <div className="nm-thread-title">{t.title}</div>
            <div className="nm-thread-meta">
              {t.loop && <span className="dot">◐ </span>}
              {t.meta}
            </div>
          </div>
        ))}
      </div>

      <div className="nm-side-footer">
        <div className="nm-avatar">M</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nm-side-footer-name">Maya Okafor</div>
          <div className="nm-side-footer-sub">day 184 · streak 9</div>
        </div>
        <button className="nm-btn ghost" style={{ padding: 4 }}><Icon name="settings" size={13} /></button>
      </div>
    </aside>
  );
};

const NavItem = ({ icon, label, k, active, onNav, count }) => (
  <button className={"nm-nav-item" + (active === k ? " active" : "")} onClick={() => onNav && onNav(k)}>
    <span className="nm-nav-ic"><Icon name={icon} /></span>
    <span>{label}</span>
    {count && <span className="nm-nav-count">{count}</span>}
  </button>
);

const TopBar = ({ crumb, children }) => (
  <div className="nm-topbar">
    <div className="nm-crumb">{crumb}</div>
    <div className="nm-top-actions">{children}</div>
  </div>
);

// Loop ring — refined
const LoopRing = ({ strength = 0.5, size = 72, showLabel = true, resolved }) => {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = resolved ? 'var(--teal)' : 'var(--accent)';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth="1.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="2" strokeDasharray={`${c * strength} ${c}`} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={r - 5} fill="none" stroke={color} strokeWidth="1" strokeDasharray={`${(c - 10) * strength * 0.6} ${c}`} opacity="0.35" />
      </svg>
      {showLabel && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.3, lineHeight: 1, letterSpacing: '-0.02em' }}>{strength.toFixed(2)}</div>
          <div className="nm-meta" style={{ fontSize: 8.5 }}>loop</div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { Icon, Sidebar, TopBar, LoopRing, BrandMark });
