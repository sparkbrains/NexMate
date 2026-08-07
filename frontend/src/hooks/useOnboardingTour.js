import { useCallback, useEffect, useRef, useState } from 'react';
import { completeOnboarding } from '../lib/api';
import { TOUR_FLOW, TOUR_STEPS } from '../lib/tourSteps';

const CHAT_SECTION = 'chat';

const storageKey = (userId) => `nextmate.onboarding_tour.${userId}`;

const loadState = (userId) => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveState = (userId, state) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    /* ignore quota / disabled storage */
  }
};

const clearState = (userId) => {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
};

const nextSectionAfter = (section) => {
  const idx = TOUR_FLOW.indexOf(section);
  if (idx === -1 || idx === TOUR_FLOW.length - 1) return null;
  return TOUR_FLOW[idx + 1];
};

// Drives the post-signup product tour as a small state machine:
//   intake question -> spotlight Today's components -> pulse the Loops nav
//   item until clicked -> spotlight Loops -> pulse Insights -> spotlight
//   Insights -> pulse Journal -> spotlight Journal -> hype "Begin
//   Reflection" -> spotlight the chat screen -> done.
// Progress is mirrored to localStorage so a refresh mid-tour doesn't send a
// real user back to square one.
export function useOnboardingTour(user, onUserUpdate) {
  const active = Boolean(user) && !user.onboarding_completed_at;
  const userId = user?.id ?? null;

  const [hasJournaledBefore, setHasJournaledBefore] = useState(null);
  const [intakeDone, setIntakeDone] = useState(false);
  // 'walk' = spotlighting `section`'s in-page steps; 'nudge' = waiting on a
  // sidebar click toward `nudgeTarget`; 'reflect-hype' = waiting on the
  // Begin Reflection click; 'chat-walk' = spotlighting the chat screen.
  const [phase, setPhase] = useState('walk');
  const [section, setSection] = useState('today');
  const [stepIdx, setStepIdx] = useState(0);
  const [nudgeTarget, setNudgeTarget] = useState(null);

  // Flips true right when the tour wraps up, driving a one-off celebration
  // banner; auto-clears itself so it never lingers across a refresh.
  const [justFinished, setJustFinished] = useState(false);
  // Opens right after that banner goes away — see the effect below — so the
  // reminder setup card is the natural next beat, not a second popup racing
  // the first one.
  const [reminderPromptOpen, setReminderPromptOpen] = useState(false);
  const finishedOnceRef = useRef(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    if (!active || userId == null) return;
    const saved = loadState(userId);
    if (saved) {
      setHasJournaledBefore(saved.hasJournaledBefore ?? null);
      setIntakeDone(Boolean(saved.intakeDone));
      if (saved.phase) setPhase(saved.phase);
      if (saved.section) setSection(saved.section);
      if (typeof saved.stepIdx === 'number') setStepIdx(saved.stepIdx);
      if (saved.nudgeTarget) setNudgeTarget(saved.nudgeTarget);
    }
    // Only ever hydrate once per user — re-running this on every state
    // change would clobber in-progress state with the stale saved copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId]);

  useEffect(() => {
    if (!active || userId == null) return;
    saveState(userId, { hasJournaledBefore, intakeDone, phase, section, stepIdx, nudgeTarget });
  }, [active, userId, hasJournaledBefore, intakeDone, phase, section, stepIdx, nudgeTarget]);

  const finish = useCallback(async (journaledValue) => {
    if (userId == null || finishingRef.current) return;
    finishingRef.current = true;
    try {
      const data = await completeOnboarding(journaledValue);
      onUserUpdate(data.user);
      setJustFinished(true);
    } catch {
      // Best-effort — if this fails the tour UI just won't reappear until
      // the next full reload, since local state below is cleared either way.
      finishingRef.current = false;
    } finally {
      clearState(userId);
    }
  }, [userId, onUserUpdate]);

  useEffect(() => {
    if (!justFinished) return;
    const t = setTimeout(() => setJustFinished(false), 5000);
    return () => clearTimeout(t);
  }, [justFinished]);

  const dismissFinished = useCallback(() => setJustFinished(false), []);

  // Chains the reminder prompt onto the celebration banner's exit, whether
  // that exit was the auto-dismiss timeout above or a manual close.
  useEffect(() => {
    if (justFinished) {
      finishedOnceRef.current = true;
    } else if (finishedOnceRef.current) {
      finishedOnceRef.current = false;
      setReminderPromptOpen(true);
    }
  }, [justFinished]);

  const dismissReminderPrompt = useCallback(() => setReminderPromptOpen(false), []);

  const answerIntake = useCallback((value) => {
    setHasJournaledBefore(value);
    setIntakeDone(true);
    setPhase('walk');
    setSection('today');
    setStepIdx(0);
  }, []);

  const skipAll = useCallback(() => {
    finish(hasJournaledBefore);
  }, [finish, hasJournaledBefore]);

  // Advances within the current section's spotlight steps; once the last
  // one passes, moves the phase machine to the next nudge/hype/finish beat.
  const next = useCallback(() => {
    const steps = (phase === 'chat-walk' ? TOUR_STEPS[CHAT_SECTION] : TOUR_STEPS[section]) || [];
    if (stepIdx + 1 < steps.length) {
      setStepIdx(stepIdx + 1);
      return;
    }
    if (phase === 'chat-walk') {
      finish(hasJournaledBefore);
      return;
    }
    const ns = nextSectionAfter(section);
    if (ns) {
      setNudgeTarget(ns);
      setPhase('nudge');
    } else {
      setPhase('reflect-hype');
    }
  }, [phase, section, stepIdx, finish, hasJournaledBefore]);

  const back = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  // Called by App whenever the active route changes, so the machine notices
  // the user actually clicked the pulsing nav item / Begin Reflection.
  const onRouteChange = useCallback((activeRoute) => {
    if (phase === 'nudge' && nudgeTarget && activeRoute === nudgeTarget) {
      setSection(nudgeTarget);
      setStepIdx(0);
      setNudgeTarget(null);
      setPhase('walk');
    } else if (phase === 'reflect-hype' && activeRoute === 'chat') {
      setSection(CHAT_SECTION);
      setStepIdx(0);
      setPhase('chat-walk');
    }
  }, [phase, nudgeTarget]);

  const steps = phase === 'chat-walk' ? TOUR_STEPS[CHAT_SECTION] : TOUR_STEPS[section];

  return {
    active,
    showIntake: active && !intakeDone,
    tourActive: active && intakeDone,
    phase,
    section,
    stepIdx,
    steps,
    nudgeTarget,
    hasJournaledBefore,
    answerIntake,
    skipAll,
    next,
    back,
    onRouteChange,
    justFinished,
    dismissFinished,
    reminderPromptOpen,
    dismissReminderPrompt,
  };
}
