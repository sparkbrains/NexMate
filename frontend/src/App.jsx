
import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/nextmate/Shell';
import { TodayScreen } from './components/nextmate/TodayScreen';
import { ChatScreen } from './components/nextmate/ChatScreen';
import { LoopsScreen } from './components/nextmate/LoopsScreen';
import { InsightsScreen, WeeklyScreen } from './components/nextmate/DataScreens';
import { AuthGate } from './components/nextmate/AuthGate';
import { clearSession, getToken, getUser, listThreads } from './lib/api';

const newThreadId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? getUser() : null));
  const [route, setRoute] = useState('today');
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(null);

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

  const openThread = (id) => {
    setThreadId(id);
    setRoute('chat');
  };

  const beginReflection = () => {
    openThread(newThreadId());
  };

  const onLogout = () => {
    clearSession();
    setUser(null);
    setThreads([]);
    setThreadId(null);
    setRoute('today');
  };

  if (!user) return <AuthGate onAuth={setUser} />;

  const activeThread = threads.find((t) => t.thread_id === threadId);

  let screen;
  if (route === 'chat') {
    screen = <ChatScreen onNav={setRoute} threadId={threadId} threadTitle={activeThread?.title} onMessageDone={refreshThreads} />;
  } else if (route === 'loops') {
    screen = <LoopsScreen />;
  } else if (route === 'insights') {
    screen = <InsightsScreen />;
  } else if (route === 'weekly') {
    screen = <WeeklyScreen />;
  } else {
    screen = <TodayScreen onNav={(r) => (r === 'chat' ? beginReflection() : setRoute(r))} />;
  }

  return (
    <div className="nm-app" data-screen-label={`Nextmate — ${route}`}>
      <Sidebar
        active={route}
        onNav={setRoute}
        threads={threads}
        activeThreadId={threadId}
        onSelectThread={openThread}
        onNewThread={beginReflection}
        user={user}
        onLogout={onLogout}
      />
      {screen}
    </div>
  );
}