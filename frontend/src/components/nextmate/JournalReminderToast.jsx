export const JournalReminderToast = ({ reminder, onDismiss, onSnooze, onJournal }) => {
  if (!reminder) return null;

  const { streak } = reminder;
  const body = streak?.current > 0
    ? `You're on a ${streak.current}-day streak — don't lose it. Take a minute to write.`
    : "You haven't journaled today. Take a minute to write.";

  return (
    <div className="nm-reminder-toast nm-fade-up" role="status">
      <div className="nm-reminder-toast-body">
        <div className="nm-eyebrow" style={{ marginBottom: 6 }}>Time to journal</div>
        <p className="nm-reminder-toast-text">{body}</p>
      </div>
      <div className="nm-reminder-toast-actions">
        <button type="button" className="nm-btn ghost" onClick={onDismiss}>
          Maybe later
        </button>
        <button type="button" className="nm-btn ghost" onClick={onSnooze}>
          Snooze 30m
        </button>
        <button type="button" className="nm-btn primary" onClick={onJournal}>
          Journal now
        </button>
      </div>
    </div>
  );
};
