import { useState } from 'react';
import { updateProfile } from '../lib/api';

// Name, date of birth, motivation, and theme are no longer collected at
// signup — this hook asks for them once, right after the user lands in the
// app. Each is skippable; skipping only dismisses it for this session,
// since the underlying field is still empty and worth asking about again
// later.
export function useProfilePrompts(user, onUserUpdate) {
  const [skippedName, setSkippedName] = useState(false);
  const [skippedDob, setSkippedDob] = useState(false);
  const [skippedMotivation, setSkippedMotivation] = useState(false);
  const [skippedTheme, setSkippedTheme] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const needsName = Boolean(user) && !user.name && !skippedName;
  const needsDob = Boolean(user) && !user.dob && !skippedDob;
  const needsMotivation = Boolean(user) && !user.motivation && !skippedMotivation;
  const needsTheme = Boolean(user) && !user.theme && !skippedTheme;
  const stage = needsName ? 'name'
    : needsDob ? 'dob'
    : needsMotivation ? 'motivation'
    : needsTheme ? 'theme'
    : null;

  // Drives the progress dots on the name/dob/motivation/theme cards —
  // recomputed every render from live state rather than captured once,
  // since which fields are outstanding can change as the user answers or
  // skips them.
  const steps = [
    { key: 'name', state: user?.name ? 'done' : stage === 'name' ? 'current' : 'upcoming' },
    { key: 'dob', state: user?.dob ? 'done' : stage === 'dob' ? 'current' : 'upcoming' },
    { key: 'motivation', state: user?.motivation ? 'done' : stage === 'motivation' ? 'current' : 'upcoming' },
    { key: 'theme', state: user?.theme ? 'done' : stage === 'theme' ? 'current' : 'upcoming' },
  ];

  const save = async (fields) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await updateProfile(fields);
      onUserUpdate(data.user);
    } catch (ex) {
      setError(ex.message || "Couldn't save that — try again.");
    } finally {
      setSaving(false);
    }
  };

  return {
    stage,
    steps,
    done: Boolean(user) && !needsName && !needsDob && !needsMotivation && !needsTheme,
    saving,
    error,
    submitName: (name) => save({ name }),
    skipName: () => setSkippedName(true),
    submitDob: (dob) => save({ dob }),
    skipDob: () => setSkippedDob(true),
    submitMotivation: (motivation) => save({ motivation }),
    skipMotivation: () => setSkippedMotivation(true),
    submitTheme: (theme) => save({ theme }),
    skipTheme: () => setSkippedTheme(true),
  };
}
