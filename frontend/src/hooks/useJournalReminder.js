import { useCallback, useEffect, useState } from 'react';
import { getJournalStreak } from '../lib/api';

const CHECK_INTERVAL_MS = 60 * 1000;

function shownKey(userId, date) {
  return `nextmate.reminder_shown.${userId}.${date.toDateString()}`;
}

// Lives at the app root (not inside any one screen) so the reminder fires
// no matter which tab of the app the user is currently on -- Today,
// Journal, Loops, etc. The in-app toast (returned as `reminder`) is the
// source of truth and shows regardless of Notification permission or tab
// focus -- browsers/OSes routinely suppress the native Notification banner
// while the tab is focused, so that's only ever a bonus alert, not the
// primary one. See ProfilePage for the permission-request flow.
export function useJournalReminder(user) {
  const [reminder, setReminder] = useState(null);

  useEffect(() => {
    if (!user?.id || !user.reminder_enabled) return undefined;

    let cancelled = false;

    const check = async () => {
      const [hh, mm] = String(user.reminder_time || '20:00').split(':').map(Number);
      const now = new Date();
      const target = new Date();
      target.setHours(hh || 0, mm || 0, 0, 0);
      if (now < target) return;

      const key = shownKey(user.id, now);
      if (localStorage.getItem(key)) return;

      try {
        const { streak } = await getJournalStreak();
        if (cancelled) return;
        if (streak?.wrote_today) {
          localStorage.setItem(key, '1');
          return;
        }
        localStorage.setItem(key, '1');
        setReminder({ streak });

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const body = streak?.current > 0
            ? `You're on a ${streak.current}-day streak -- don't lose it. Take a minute to write.`
            : "You haven't journaled today. Take a minute to write.";
          const notification = new Notification('Time to journal', { body, tag: 'nextmate-journal-reminder' });
          notification.onclick = () => { window.focus(); notification.close(); };
        }
      } catch {
        /* backend unreachable -- try again on the next tick */
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.id, user?.reminder_enabled, user?.reminder_time]);

  const dismissReminder = useCallback(() => setReminder(null), []);

  return { reminder, dismissReminder };
}