import { useState } from 'react';
import { Icon } from './Shell';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { updateReminderSettings } from '../../lib/api';

const formatTime = (value) => {
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

// The final beat of the first-run tour — shown once the celebration banner
// (see TourCompleteToast / useOnboardingTour) has had its moment. Opting in
// here requests Notification permission up front so the daily nudge the
// user just asked for can actually fire later, via useJournalReminder.
export const ReminderSetupCard = ({ open, onUserUpdate, onDismiss }) => {
  const [time, setTime] = useState('20:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useDelayedUnmount(open, 260);
  if (!mounted) return null;

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return true;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const granted = await requestPermission();
      if (!granted) {
        setError('Allow notifications in your browser to turn reminders on.');
        return;
      }
      const data = await updateReminderSettings(true, time);
      onUserUpdate(data.user);
      onDismiss();
    } catch (ex) {
      setError(ex.message || "Couldn't save that — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`nm-pp-overlay ${open ? 'nm-in' : 'nm-out'}`}>
      <form className={`nm-onboard-card ${open ? 'nm-pop-in' : 'nm-pop-out'}`} onSubmit={submit}>
        <button type="button" className="nm-onboard-skip" onClick={onDismiss} disabled={saving}>
          Skip
        </button>
        <div className="nm-onboard-icon nm-icon-pop" style={{ marginBottom: 14 }}>
          <Icon name="bell" size={18} />
        </div>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Last thing, promise</div>
        <h2 className="nm-h2" style={{ marginBottom: 10 }}>Want a nudge to check in?</h2>
        <p className="nm-body" style={{ marginBottom: 22 }}>
          One quiet reminder a day, only if you haven't written yet. Change it
          or turn it off anytime from your profile.
        </p>
        <div className="nm-field" style={{ marginBottom: error ? 10 : 22 }}>
          <label htmlFor="nm-reminder-time" className="nm-field-label">Remind me at</label>
          <input
            id="nm-reminder-time"
            className="nm-field-input"
            type="time"
            autoFocus
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <span className="nm-field-mark" />
        </div>
        {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 14 }}>{error}</div>}
        <button
          className="nm-btn primary"
          type="submit"
          disabled={!time || saving}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {saving ? 'Setting it up…' : `Remind me at ${formatTime(time)}`}
        </button>
      </form>
    </div>
  );
};
