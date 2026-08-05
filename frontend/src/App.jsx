import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/nextmate/Shell';
import { PromptPackPop } from './components/nextmate/PromptPackPop';
import { TodayScreen } from './components/nextmate/TodayScreen';
import { ChatScreen } from './components/nextmate/ChatScreen';
import { LoopsScreen } from './components/nextmate/LoopsScreen';
import { InsightsScreen } from './components/nextmate/DataScreens';
import { JournalScreen } from './components/nextmate/JournalScreen';
import { PromptPacksScreen } from './components/nextmate/PromptPacksScreen';
import PricingScreen from './components/nextmate/PricingScreen';
import { LandingPage } from './components/nextmate/LandingPage';
import { ProfilePage } from './components/nextmate/ProfilePage';
import { SupportWidget } from './components/nextmate/SupportWidget';
import { JournalReminderToast } from './components/nextmate/JournalReminderToast';
import { clearSession, deleteThread as deleteThreadApi, getMe, getToken, getUser, listThreads, logout as apiLogout, persistUser } from './lib/api';
import { AppContext } from './context';
import { useJournalReminder } from './hooks/useJournalReminder';

const newThreadId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

const ROUTE_PATH = {
  today: '/today',
  chat: '/chat',
  journal: '/journal',
  'prompt-packs': '/prompt-packs',
  loops: '/loops',
  insights: '/insights',
  profile: '/profile',
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => (getToken() ? getUser() : null));
  const [threads, setThreads] = useState([]);
  const currentThreadId = location.pathname.match(/^\/chat\/([^/]+)$/)?.[1] || null;
  const chatParams = location.state || null;
  const activeThread = threads.find((t) => t.thread_id === currentThreadId);

  // Validate token on mount
  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then((data) => { setUser(data.user); persistUser(data.user); })
      .catch(() => { clearSession(); setUser(null); });
  }, []);

  const { reminder, dismissReminder, snoozeReminder } = useJournalReminder(user);

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

  // Close sidebar drawer on navigation
  const navigateTo = (r) => {
    navigate(ROUTE_PATH[r] || '/today');
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
    navigate(`/chat/${id}`, { state: params });
    setSidebarOpen(false);
  };

  const beginReflection = () => {
    openThread(newThreadId(), null);
  };

  const onDeleteThread = useCallback(async (id) => {
    try {
      await deleteThreadApi(id);
      setThreads((prev) => prev.filter((t) => t.thread_id !== id));
      if (currentThreadId === id) navigate('/today', { replace: true });
    } catch { /* ignore */ }
  }, [currentThreadId, navigate]);

  const onLogout = async () => {
    try { await apiLogout(); } catch { clearSession(); }
    setUser(null);
    setThreads([]);
    navigate('/today', { replace: true });
  };

  const onAuthExpired = () => {
    setUser(null);
    setThreads([]);
    navigate('/today', { replace: true });
  };

  if (!user) {
    if (location.pathname === '/pricing') {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
          <PricingScreen isLanding={true} />
        </div>
      );
    }
    const authMode = location.pathname === '/login' ? 'login'
      : location.pathname === '/signup' ? 'signup'
      : null;
    return <LandingPage onAuth={setUser} authMode={authMode} />;
  }

  const activeRoute = location.pathname.split('/')[1] || 'today';

  const chatEl = (
    <ChatScreen
      onNav={navigateTo}
      threadId={currentThreadId}
      threadTitle={chatParams?.threadTitle || activeThread?.title}
      initialMessage={chatParams?.initialMessage}
      onMessageDone={refreshThreads}
      onAuthExpired={onAuthExpired}
    />
  );

  const todayEl = (
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

  const loopsEl = (
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

  return (
    <AppContext.Provider value={{ theme, setTheme, sidebarOpen, setSidebarOpen }}>
      <div className="nm-app" data-screen-label={`Nextmate — ${activeRoute}`}>
        <Sidebar
          active={activeRoute}
          onNav={navigateTo}
          threads={threads}
          activeThreadId={currentThreadId}
          onSelectThread={openThread}
          onNewThread={beginReflection}
          onDeleteThread={onDeleteThread}
          user={user}
          onLogout={onLogout}
        />
        <Routes>
          <Route path="/today" element={todayEl} />
          <Route path="/chat" element={chatEl} />
          <Route path="/chat/:threadId" element={chatEl} />
          <Route path="/journal" element={<JournalScreen user={user} />} />
          <Route path="/prompt-packs" element={<PromptPacksScreen />} />
          <Route path="/loops" element={loopsEl} />
          <Route path="/insights" element={<InsightsScreen />} />
          <Route
            path="/profile"
            element={(
              <ProfilePage
                onLogout={onLogout}
                onUserUpdate={(updated) => { setUser(updated); persistUser(updated); }}
              />
            )}
          />
          <Route path="/pricing" element={<Navigate to="/today" replace />} />
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
        <PromptPackPop />
        <SupportWidget />
        <JournalReminderToast
          reminder={reminder}
          onDismiss={dismissReminder}
          onSnooze={snoozeReminder}
          onJournal={() => { dismissReminder(); navigateTo('journal'); }}
        />
      </div>
    </AppContext.Provider>
  );
}