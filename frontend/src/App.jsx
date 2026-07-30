import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/nextmate/Shell';
import { PromptPackPop } from './components/nextmate/PromptPackPop';
import { TodayScreen } from './components/nextmate/TodayScreen';
import { ChatScreen } from './components/nextmate/ChatScreen';
import { LoopsScreen } from './components/nextmate/LoopsScreen';
import { InsightsScreen } from './components/nextmate/DataScreens';
import { JournalScreen } from './components/nextmate/JournalScreen';
import PricingScreen from './components/nextmate/PricingScreen';
import { LandingPage } from './components/nextmate/LandingPage';
import { ProfilePage } from './components/nextmate/ProfilePage';
import { SupportWidget } from './components/nextmate/SupportWidget';
import { clearSession, deleteThread as deleteThreadApi, getMe, getToken, getUser, listThreads, logout as apiLogout } from './lib/api';
import { AppContext } from './context';

const newThreadId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? getUser() : null));
  const [route, setRoute] = useState('today');
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [chatParams, setChatParams] = useState(null);

  // Validate token on mount
  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then((data) => setUser(data.user))
      .catch(() => { clearSession(); setUser(null); });
  }, []);

  // Theme state — auth screen always light; restore saved theme after login
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('nextmate_theme') || 'light';
    return saved;
  });

  // Mobile sidebar open state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Force light mode on auth screen, apply saved theme when logged in
    const active = user ? theme : 'light';
    document.documentElement.setAttribute('data-theme', active);
    if (user) localStorage.setItem('nextmate_theme', theme);
  }, [theme, user]);

  // Initialize from URL query param (e.g., ?thread=abc123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get('thread');
    if (tid) {
      setThreadId(tid);
      setRoute('chat');
    }
  }, []);

  // Close sidebar drawer on route change
  const navigateTo = (r) => {
    setRoute(r);
    setSidebarOpen(false);
  };

  const refreshThreads = useCallback(async () => {
    try {
      const data = await listThreads();
      setThreads(data.threads || []);
    } catch {
      /* ignore — likely 401; user will be logged out elsewhere */
    }
  }, []);

  useEffect(() => {
    if (user) refreshThreads();
  }, [user, refreshThreads]);

  const openThread = (id, params = null) => {
    setThreadId(id);
    setChatParams(params);
    navigateTo('chat');
  };

  const beginReflection = () => {
    openThread(newThreadId(), null);
  };

  const onDeleteThread = useCallback(async (id) => {
    try {
      await deleteThreadApi(id);
      setThreads((prev) => prev.filter((t) => t.thread_id !== id));
      if (threadId === id) { setThreadId(null); setChatParams(null); navigateTo('today'); }
    } catch { /* ignore */ }
  }, [threadId]);

  const onLogout = async () => {
    try { await apiLogout(); } catch { clearSession(); }
    setUser(null);
    setThreads([]);
    setThreadId(null);
    setChatParams(null);
    navigateTo('today');
  };

  const onAuthExpired = () => {
    setUser(null);
    setThreads([]);
    setThreadId(null);
    setChatParams(null);
    navigateTo('today');
  };

  if (!user) {
    if (window.location.pathname === '/pricing') {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
          <PricingScreen isLanding={true} />
        </div>
      );
    }
    return <LandingPage onAuth={setUser} />;
  }

  const activeThread = threads.find((t) => t.thread_id === threadId);

  let screen;
  if (route === 'chat') {
    screen = (
      <ChatScreen
        onNav={navigateTo}
        threadId={threadId}
        threadTitle={chatParams?.threadTitle || activeThread?.title}
        initialMessage={chatParams?.initialMessage}
        onMessageDone={refreshThreads}
        onAuthExpired={onAuthExpired}
      />
    );
  } else if (route === 'journal') {
    screen = <JournalScreen user={user} />;
  } else if (route === 'loops') {
    screen = (
      <LoopsScreen
        onNav={(r, params) => {
          if (r === 'chat') {
            params?.threadId ? openThread(params.threadId, params) : beginReflection();
          } else {
            navigateTo(r);
          }
        }}
      />
    );
  } else if (route === 'insights') {
    screen = <InsightsScreen />;
  } else if (route === 'profile') {
    screen = <ProfilePage onLogout={onLogout} />;
  } else {
    screen = (
      <TodayScreen
        onNav={(r, params) => {
          if (r === 'chat') {
            refreshThreads();
            params?.threadId ? openThread(params.threadId, params) : beginReflection();
          } else {
            navigateTo(r);
          }
        }}
        threads={threads}
        user={user}
      />
    );
  }

  return (
    <AppContext.Provider value={{ theme, setTheme, sidebarOpen, setSidebarOpen }}>
      <div className="nm-app" data-screen-label={`Nextmate — ${route}`}>
        <Sidebar
          active={route}
          onNav={navigateTo}
          threads={threads}
          activeThreadId={threadId}
          onSelectThread={openThread}
          onNewThread={beginReflection}
          onDeleteThread={onDeleteThread}
          user={user}
          onLogout={onLogout}
        />
        {screen}
        <PromptPackPop />
        <SupportWidget />
      </div>
    </AppContext.Provider>
  );
}