import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/nextmate/Shell';
import { TodayScreen } from './components/nextmate/TodayScreen';
import { ChatScreen } from './components/nextmate/ChatScreen';
import { LoopsScreen } from './components/nextmate/LoopsScreen';
import { InsightsScreen } from './components/nextmate/DataScreens';

import { JournalScreen } from './components/nextmate/JournalScreen';
import { AuthGate } from './components/nextmate/AuthGate';
import { clearSession, getToken, getUser, listThreads } from './lib/api';
import { AppContext } from './context';

const newThreadId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? getUser() : null));
  const [route, setRoute] = useState('today');
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [chatParams, setChatParams] = useState(null);

  // Theme state
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('nextmate_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  // Mobile sidebar open state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nextmate_theme', theme);
  }, [theme]);

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

  const onLogout = () => {
    clearSession();
    setUser(null);
    setThreads([]);
    setThreadId(null);
    setChatParams(null);
    navigateTo('today');
  };

  if (!user) return <AuthGate onAuth={setUser} />;

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
      />
    );
  } else if (route === 'journal') {
    screen = <JournalScreen />;
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
  } else {
    screen = (
      <TodayScreen
        onNav={(r, params) => {
          if (r === 'chat') {
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
          user={user}
          onLogout={onLogout}
        />
        {screen}
      </div>
    </AppContext.Provider>
  );
}