import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/nextmate/Shell';
import { ConsentPrompt } from './components/nextmate/ConsentPrompt';
import { NamePrompt, DobPrompt } from './components/nextmate/ProfilePrompts';
import { MotivationPrompt } from './components/nextmate/MotivationPrompt';
import { ThemePrompt } from './components/nextmate/ThemePrompt';
import { OnboardingIntake } from './components/nextmate/OnboardingIntake';
import { TourSpotlight } from './components/nextmate/TourSpotlight';
import { TourNudgeCard } from './components/nextmate/TourNudgeCard';
import { TourCompleteToast } from './components/nextmate/TourCompleteToast';
import { ReminderSetupCard } from './components/nextmate/ReminderSetupCard';
import { PromptPackPop } from './components/nextmate/PromptPackPop';
import { RewardsPanel } from './components/nextmate/RewardsPanel';
import { RewardBadgeToast } from './components/nextmate/RewardBadgeToast';
import { TodayScreen } from './components/nextmate/TodayScreen';
import { ChatScreen } from './components/nextmate/ChatScreen';
import { LoopsScreen } from './components/nextmate/LoopsScreen';
import { InsightsScreen } from './components/nextmate/DataScreens';
import { JournalScreen } from './components/nextmate/JournalScreen';
import { PromptPacksScreen } from './components/nextmate/PromptPacksScreen';
import PricingScreen from './components/nextmate/PricingScreen';
import { LandingPage } from './components/nextmate/LandingPage';
import LogoIco from './assets/ic_logo.svg';
import { ProfilePage } from './components/nextmate/ProfilePage';
import { SupportWidget } from './components/nextmate/SupportWidget';
import { JournalReminderToast } from './components/nextmate/JournalReminderToast';
import { acceptConsent, clearSession, deleteThread as deleteThreadApi, getMe, getToken, getUser, listThreads, logout as apiLogout, logoutAllDevices as apiLogoutAllDevices, persistUser } from './lib/api';
import { AppContext } from './context';
import { useJournalReminder } from './hooks/useJournalReminder';
import { useRewardsWatcher } from './hooks/useRewardsWatcher';
import { useOnboardingTour } from './hooks/useOnboardingTour';
import { useProfilePrompts } from './hooks/useProfilePrompts';

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
  const rewards = useRewardsWatcher(user);
  const onUserUpdate = (updated) => { setUser(updated); persistUser(updated); };
  const profilePrompts = useProfilePrompts(user, onUserUpdate);
  const tour = useOnboardingTour(user, onUserUpdate);

  // Gates every other first-run overlay: nobody sees name/dob/theme prompts
  // or the tour until they've accepted the data-use consent popup. This
  // also catches accounts that predate the popup (consent_accepted_at is
  // NULL for them too), so it isn't only a signup-time thing.
  const needsConsent = Boolean(user) && !user.consent_accepted_at;
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentError, setConsentError] = useState(null);
  const onAcceptConsent = async () => {
    if (consentSaving) return;
    setConsentSaving(true);
    setConsentError(null);
    try {
      const data = await acceptConsent();
      onUserUpdate(data.user);
    } catch (ex) {
      setConsentError(ex.message || "Couldn't save that — try again.");
    } finally {
      setConsentSaving(false);
    }
  };
  const activeRoute = location.pathname.split('/')[1] || 'today';

  // Lets the tour's state machine notice the user actually clicked the
  // pulsing nav item (or Begin Reflection) it was nudging them toward.
  useEffect(() => {
    if (profilePrompts.done && tour.tourActive) tour.onRouteChange(activeRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute, profilePrompts.done, tour.tourActive]);

  // Theme state — auth screen always light; restore saved theme after login
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('nextmate_theme') || 'light';
    return saved;
  });

  // Mobile sidebar open state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Rewards panel — opened via the trophy button in TopBar (lives outside
  // Shell.jsx to avoid a circular import with Icon, same as PromptPackPop).
  const [rewardsOpen, setRewardsOpen] = useState(false);

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

  const onLogoutAllDevices = async () => {
    try { await apiLogoutAllDevices(); } catch { clearSession(); }
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
        <div className="nm-land" style={{ height: 'auto', minHeight: '100vh' }}>
          <nav className="nm-land-nav">
            <img
              src={LogoIco}
              alt="Nextmate"
              height="30"
              className="nm-logo"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/')}
            />
            <div className="nm-land-nav-actions">
              <button className="nm-land-nav-link" onClick={() => navigate('/login')}>Sign In</button>
              <button className="nm-land-nav-cta" onClick={() => navigate('/signup')}>Make a Space</button>
            </div>
          </nav>
          <img className="nm-pricing-sticker nm-pricing-sticker-left" src="/stickers/picnic/jam-jar.png" alt="" aria-hidden="true" />
          <img className="nm-pricing-sticker nm-pricing-sticker-right" src="/stickers/scrapbook/great-wave.png" alt="" aria-hidden="true" />
          <PricingScreen isLanding={true} />
        </div>
      );
    }
    const authMode = location.pathname === '/login' ? 'login'
      : location.pathname === '/signup' ? 'signup'
      : null;
    return <LandingPage onAuth={setUser} authMode={authMode} />;
  }

  // True while any first-run overlay (name/dob prompts, the tour intake,
  // or the bubble tour itself) is in play — used to hold off other
  // attention-grabbing popups until the user's through it.
  const onboardingInProgress = needsConsent || !profilePrompts.done || tour.active || tour.justFinished || tour.reminderPromptOpen;

  // The app behind the card stays blurred through consent and the required
  // identity steps — name, dob, intent — so there's nothing legible to peek
  // at before those are answered. Theme is optional polish, not required,
  // so it doesn't hold the blur.
  const blurBackground = needsConsent || ['name', 'dob', 'motivation'].includes(profilePrompts.stage);

  // The tour itself must not start until consent and the name/dob/motivation/
  // theme prompts are behind us — otherwise a stale `intakeDone` carried
  // over in localStorage (e.g. from before those prompts existed) can let
  // the tour race ahead and render on top of them.
  const tourReady = !needsConsent && profilePrompts.done && tour.tourActive;

  // True while the tour is actively spotlighting the given section. Screens
  // use this only to hide an empty-state card's CTA button (e.g. "Begin a
  // Chat") — clicking it mid-tour would jump away from the walkthrough. The
  // card itself still renders for real, blurred behind the same empty-state
  // overlay it would show outside the tour; there's no separate fake data.
  const tourSampleFor = (key) => tourReady && tour.phase === 'walk' && tour.section === key;

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
      tourSample={tourSampleFor('today')}
    />
  );

  const loopsEl = (
    <LoopsScreen
      threads={threads}
      onNav={(r, params) => {
        if (r === 'chat') {
          params?.threadId ? openThread(params.threadId, params) : beginReflection();
        } else {
          navigateTo(r);
        }
      }}
      tourSample={tourSampleFor('loops')}
    />
  );

  return (
    <AppContext.Provider value={{
      theme, setTheme, sidebarOpen, setSidebarOpen, rewardsOpen, setRewardsOpen,
      hasUnseenReward: rewards.hasUnseen, rewardPoints: rewards.points, checkRewards: rewards.checkRewards, markRewardsSeen: rewards.markSeen,
    }}>
      <div className="nm-app" data-screen-label={`Nextmate — ${activeRoute}`}>
        <div className={`nm-app-content${blurBackground ? ' nm-app-blurred' : ''}`}>
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
            tourNudgeTarget={tourReady && tour.phase === 'nudge' ? tour.nudgeTarget : null}
            tourHypeReflection={tourReady && tour.phase === 'reflect-hype'}
          />
          <Routes>
            <Route path="/today" element={todayEl} />
            <Route path="/chat" element={chatEl} />
            <Route path="/chat/:threadId" element={chatEl} />
            <Route path="/journal" element={<JournalScreen user={user} />} />
            <Route path="/prompt-packs" element={<PromptPacksScreen />} />
            <Route path="/loops" element={loopsEl} />
            <Route path="/insights" element={<InsightsScreen tourSample={tourSampleFor('insights')} threads={threads} onNav={(r) => { if (r === 'chat') beginReflection(); else navigateTo(r); }} />} />
            <Route
              path="/profile"
              element={(
                <ProfilePage
                  onLogout={onLogout}
                  onLogoutAllDevices={onLogoutAllDevices}
                  onUserUpdate={onUserUpdate}
                />
              )}
            />
            <Route path="/pricing" element={<Navigate to="/today" replace />} />
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
        {!onboardingInProgress && <PromptPackPop />}
        <RewardsPanel open={rewardsOpen} onClose={() => setRewardsOpen(false)} />
        <RewardBadgeToast badge={rewards.toastBadge} onDismiss={rewards.dismissToast} />
        <SupportWidget />
        {!onboardingInProgress && (
          <JournalReminderToast
            reminder={reminder}
            onDismiss={dismissReminder}
            onSnooze={snoozeReminder}
            onJournal={() => { dismissReminder(); navigateTo('journal'); }}
          />
        )}
        <ConsentPrompt
          open={needsConsent}
          onAccept={onAcceptConsent}
          saving={consentSaving}
          error={consentError}
        />
        <NamePrompt
          open={!needsConsent && profilePrompts.stage === 'name'}
          steps={profilePrompts.steps}
          onSubmit={profilePrompts.submitName}
          onSkip={profilePrompts.skipName}
          saving={profilePrompts.saving}
          error={profilePrompts.error}
        />
        <DobPrompt
          open={!needsConsent && profilePrompts.stage === 'dob'}
          steps={profilePrompts.steps}
          onSubmit={profilePrompts.submitDob}
          onSkip={profilePrompts.skipDob}
          saving={profilePrompts.saving}
          error={profilePrompts.error}
        />
        <MotivationPrompt
          open={!needsConsent && profilePrompts.stage === 'motivation'}
          steps={profilePrompts.steps}
          onSubmit={profilePrompts.submitMotivation}
          onSkip={profilePrompts.skipMotivation}
          saving={profilePrompts.saving}
          error={profilePrompts.error}
        />
        <ThemePrompt
          open={!needsConsent && profilePrompts.stage === 'theme'}
          steps={profilePrompts.steps}
          currentTheme={theme}
          onPreview={setTheme}
          onSubmit={profilePrompts.submitTheme}
          onSkip={profilePrompts.skipTheme}
          saving={profilePrompts.saving}
          error={profilePrompts.error}
        />
        <OnboardingIntake
          open={!needsConsent && profilePrompts.done && tour.showIntake}
          userName={user.name}
          onAnswer={tour.answerIntake}
          onSkip={tour.skipAll}
        />
        <TourSpotlight
          open={Boolean(
            tourReady
            && (tour.phase === 'walk' || tour.phase === 'chat-walk')
            && activeRoute === (tour.phase === 'chat-walk' ? 'chat' : tour.section)
          )}
          steps={tour.steps}
          stepIndex={tour.stepIdx}
          onNext={tour.next}
          onBack={tour.back}
          onSkip={tour.skipAll}
        />
        <TourNudgeCard
          open={tourReady && (tour.phase === 'nudge' || tour.phase === 'reflect-hype')}
          copyKey={tour.phase === 'reflect-hype' ? 'reflect' : tour.nudgeTarget}
          onSkip={tour.skipAll}
        />
        <TourCompleteToast open={tour.justFinished} onDismiss={tour.dismissFinished} />
        <ReminderSetupCard
          open={tour.reminderPromptOpen}
          onUserUpdate={onUserUpdate}
          onDismiss={tour.dismissReminderPrompt}
        />
      </div>
    </AppContext.Provider>
  );
}