import { useState } from 'react';
import { Icon } from './Shell';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';

export const StepDots = ({ steps }) => (
  <div className="nm-onboard-progress">
    {steps.map((s) => (
      <span key={s.key} className={`nm-onboard-dot ${s.state}`} />
    ))}
  </div>
);

export const NamePrompt = ({ open, steps, onSubmit, onSkip, saving, error }) => {
  const [value, setValue] = useState('');
  const mounted = useDelayedUnmount(open, 260);
  if (!mounted) return null;

  const submit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    onSubmit(trimmed);
  };

  return (
    <div className={`nm-pp-overlay ${open ? 'nm-in' : 'nm-out'}`}>
      <form className={`nm-onboard-card ${open ? 'nm-pop-in' : 'nm-pop-out'}`} onSubmit={submit}>
        <button type="button" className="nm-onboard-skip" onClick={onSkip} disabled={saving}>
          Skip
        </button>
        {steps && <StepDots steps={steps} />}
        <div className="nm-onboard-icon nm-icon-pop" style={{ marginBottom: 14 }}>
          <Icon name="user" size={18} />
        </div>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>Before we go any further</div>
        <h2 className="nm-h2" style={{ marginBottom: 10 }}>What should we call you?</h2>
        <p className="nm-body" style={{ marginBottom: 22 }}>
          No forms, no fine print — just a name, so this feels like a conversation and not a login screen.
        </p>
        <div className="nm-field" style={{ marginBottom: error ? 10 : 22 }}>
          <label htmlFor="nm-prompt-name" className="nm-field-label">Your name</label>
          <input
            id="nm-prompt-name"
            className="nm-field-input"
            type="text"
            autoFocus
            autoComplete="name"
            placeholder="or whatever you go by"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="nm-field-mark" />
          {value.trim() && (
            <div className="nm-field-preview">We'll call you <strong>{value.trim()}</strong>.</div>
          )}
        </div>
        {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 14 }}>{error}</div>}
        <button
          className="nm-btn primary"
          type="submit"
          disabled={!value.trim() || saving}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {saving ? 'Saving…' : "That's me"}
        </button>
      </form>
    </div>
  );
};

const ageFromDob = (dob) => {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};

export const DobPrompt = ({ open, steps, onSubmit, onSkip, saving, error }) => {
  const [value, setValue] = useState('');
  const mounted = useDelayedUnmount(open, 260);
  if (!mounted) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!value || saving) return;
    onSubmit(value);
  };

  const age = value ? ageFromDob(value) : null;

  return (
    <div className={`nm-pp-overlay ${open ? 'nm-in' : 'nm-out'}`}>
      <form className={`nm-onboard-card ${open ? 'nm-pop-in' : 'nm-pop-out'}`} onSubmit={submit}>
        <button type="button" className="nm-onboard-skip" onClick={onSkip} disabled={saving}>
          Skip
        </button>
        {steps && <StepDots steps={steps} />}
        <div className="nm-onboard-icon nm-icon-pop" style={{ marginBottom: 14 }}>
          <Icon name="weekly" size={18} />
        </div>
        <div className="nm-eyebrow" style={{ marginBottom: 10 }}>One more thing</div>
        <h2 className="nm-h2" style={{ marginBottom: 10 }}>When's your birthday?</h2>
        <p className="nm-body" style={{ marginBottom: 22 }}>
          We're not into horoscopes — it just helps us pace things right, whatever season of life you're in.
        </p>
        <div className="nm-field" style={{ marginBottom: error ? 10 : 22 }}>
          <label htmlFor="nm-prompt-dob" className="nm-field-label">Date of birth</label>
          <input
            id="nm-prompt-dob"
            className="nm-field-input"
            type="date"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="nm-field-mark" />
          {age !== null && age >= 0 && (
            <div className="nm-field-preview">That puts you at <strong>{age}</strong>. Noted, not judged.</div>
          )}
        </div>
        {error && <div className="nm-meta" style={{ color: 'var(--accent)', marginBottom: 14 }}>{error}</div>}
        <button
          className="nm-btn primary"
          type="submit"
          disabled={!value || saving}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {saving ? 'Saving…' : 'Save it'}
        </button>
      </form>
    </div>
  );
};
