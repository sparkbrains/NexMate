import { useCallback, useEffect, useRef, useState } from 'react';
import { listRewards } from '../lib/api';

const POLL_INTERVAL_MS = 60 * 1000;

function seenKey(userId) {
  return `nextmate.badges_seen.${userId}`;
}

function loadSeen(userId) {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeen(userId, set) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify([...set]));
  } catch {
    /* ignore quota / disabled storage */
  }
}

// Lives at the app root (mirrors useJournalReminder) so a badge unlock is
// noticed no matter which screen the user is on. GET /api/rewards is a
// lazy-evaluation endpoint -- it computes and persists any newly-earned
// badge on the one call that first qualifies for it, flagging that call's
// response with just_unlocked: true. That flag is server-authoritative and
// fires exactly once per badge ever, so it alone drives the toast queue --
// no client-side dedup bookkeeping needed for it.
//
// The notification dot is a separate, purely client-side concept: it stays
// lit for any unlocked badge the user hasn't opened the Rewards panel to
// look at yet, tracked in localStorage per user so it survives a reload.
export function useRewardsWatcher(user) {
  const [toastQueue, setToastQueue] = useState([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [points, setPoints] = useState(0);
  const seenRef = useRef(new Set());
  const toastedRef = useRef(new Set());
  const lastBadgesRef = useRef([]);

  useEffect(() => {
    if (!user?.id) return;
    seenRef.current = loadSeen(user.id);
    toastedRef.current = new Set();
    lastBadgesRef.current = [];
    setHasUnseen(false);
    setToastQueue([]);
    setPoints(0);
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listRewards();
      const badges = data?.badges || [];
      lastBadgesRef.current = badges;
      setPoints(data?.points || 0);

      const freshlyUnlocked = badges.filter(
        (b) => b.unlocked && b.just_unlocked && !toastedRef.current.has(b.key)
      );
      if (freshlyUnlocked.length) {
        freshlyUnlocked.forEach((b) => toastedRef.current.add(b.key));
        setToastQueue((prev) => [...prev, ...freshlyUnlocked]);
      }

      const unseen = badges.some((b) => b.unlocked && !seenRef.current.has(b.key));
      setHasUnseen(unseen);
    } catch {
      /* backend unreachable -- try again on the next tick */
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [user?.id, refresh]);

  const dismissToast = useCallback(() => {
    setToastQueue((prev) => prev.slice(1));
  }, []);

  // Called when the Rewards panel is opened -- marks every currently-known
  // unlocked badge as seen so the dot clears. Uses whatever the last
  // refresh() saw rather than fetching again; the panel does its own fetch
  // for display, so this only needs to be accurate to "the last minute or
  // so", not to the millisecond.
  const markSeen = useCallback(() => {
    if (!user?.id) return;
    lastBadgesRef.current.forEach((b) => { if (b.unlocked) seenRef.current.add(b.key); });
    saveSeen(user.id, seenRef.current);
    setHasUnseen(false);
  }, [user?.id]);

  return {
    toastBadge: toastQueue[0] || null,
    dismissToast,
    hasUnseen,
    points,
    checkRewards: refresh,
    markSeen,
  };
}
