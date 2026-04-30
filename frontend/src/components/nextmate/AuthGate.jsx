import { useMemo, useState } from 'react';
import { login, signup } from '../../lib/api';
import { BrandMark } from './Shell';

const QUOTES = [
  "The thought you keep circling is trying to tell you something.",
  "Rest is not the opposite of work. It's part of the work.",
  "You don't have to finish the thought. You have to begin it.",
  "What you notice is what becomes you.",
];

const HeroMark = () => (
  <svg className="nm-breathe" width="72" height="72" viewBox="0 0 72 72" aria-hidden>
    <defs>
      <linearGradient id="nm-arc" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--accent)" />
        <stop offset="100%" stopColor="var(--accent-2)" />
      </linearGradient>
    </defs>
    <circle cx="36" cy="36" r="30" fill="none" stroke="var(--rule)" strokeWidth="1" />
    <circle
      cx="36" cy="36" r="30"
      fill="none"
      stroke="url(#nm-arc)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeDasharray="140 188"
      transform="rotate(-90 36 36)"
      style={{ animation: 'nm-draw 2.2s cubic-bezier(.2,.7,.3,1) 0.3s both' }}
    />
    <circle cx="36" cy="36" r="3" fill="var(--accent)" />
  </svg>
);

const today = () => {
  const d = new Date();
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

export function AuthGate({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);
  const isLogin = mode === 'login';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const fn = isLogin ? login : signup;
      const data = await fn(email.trim(), password);
      onAuth(data.user);
    } catch (ex) {
      setErr(prettyError(ex.message) || 'Something didn’t connect. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = () => {
    setErr(null);
    setMode(isLogin ? 'signup' : 'login');
  };

  return (
    <div className="nm-auth">
      {/* LEFT — editorial hero */}
      <section className="nm-auth-hero">
        <header className="nm-auth-mast nm-reveal" data-d="1">
          <BrandMark />
          <div className="nm-brand-name">next<em>mate</em></div>
        </header>

        <div>
          <div
            className="nm-reveal"
            data-d="2"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--ink-4)',
              marginBottom: 28,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span>Chapter ∞ ·</span>
            <span style={{ color: 'var(--accent)', fontStyle: 'italic', textTransform: 'none', fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '-0.01em' }}>
              a quiet place to think out loud
            </span>
          </div>

          <h1 className="nm-auth-headline nm-reveal" data-d="3">
            {isLogin ? (
              <>Come back to the <em>thought</em><br />you were having.</>
            ) : (
              <>Begin a <em>thinking</em><br />practice.</>
            )}
          </h1>

          <p className="nm-auth-sub nm-reveal" data-d="4">
            {isLogin
              ? "It’s been waiting. Nothing here is graded, indexed, or optimised — only noticed."
              : "Ninety days of memory. Unhurried reflection. Patterns you couldn’t see from inside the week."}
          </p>

          <div className="nm-reveal" data-d="5" style={{ marginTop: 40 }}>
            <HeroMark />
          </div>
        </div>

        <footer className="nm-auth-foot nm-reveal" data-d="6">
          <div>
            <div style={{ marginBottom: 4 }}>{today()}</div>
            <div><b>entry 001</b> · you</div>
          </div>
          <div className="nm-auth-quote">{quote}</div>
        </footer>
      </section>

      {/* RIGHT — entry form */}
      <section className="nm-auth-pane">
        <div className="nm-auth-pane-head nm-reveal" data-d="2">
          <span>{isLogin ? 'To return —' : 'To begin —'}</span>
          <span className="entry-no">no. 00{isLogin ? '1' : '2'}</span>
        </div>

        <form onSubmit={submit} className="nm-auth-form nm-reveal" data-d="3" noValidate>
          <h2 className="nm-auth-title">
            {isLogin ? <>Sign <em>in.</em></> : <>Make <em>room.</em></>}
          </h2>

          <div className="nm-field">
            <label htmlFor="nm-email" className="nm-field-label">Email</label>
            <input
              id="nm-email"
              className="nm-field-input"
              type="email"
              autoComplete="email"
              placeholder="you@somewhere.quiet"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <span className="nm-field-mark" />
          </div>

          <div className="nm-field">
            <label htmlFor="nm-pass" className="nm-field-label">
              Password · {isLogin ? 'the one you chose' : 'pick something memorable'}
            </label>
            <input
              id="nm-pass"
              className="nm-field-input"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder={isLogin ? '••••••••' : 'at least eight soft characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isLogin ? undefined : 8}
            />
            <span className="nm-field-mark" />
          </div>

          {err && <div className="nm-auth-err">{err}</div>}

          <button className="nm-auth-submit" type="submit" disabled={busy}>
            <span>
              {busy ? (isLogin ? 'Returning' : 'Opening') : isLogin ? <>Return<em>.</em></> : <>Begin<em>.</em></>}
            </span>
            <span className="arrow" aria-hidden>→</span>
          </button>
        </form>

        <div className="nm-reveal" data-d="5" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button className="nm-auth-toggle" onClick={toggle} type="button">
            {isLogin ? <>New here? <u>Make a space</u></> : <>Been here before? <u>Sign in</u></>}
          </button>
          <div className="nm-auth-fineprint">
            Nextmate keeps 90 days of memory.<br />
            It doesn’t provide clinical advice — it reflects.
          </div>
        </div>
      </section>
    </div>
  );
}

function prettyError(msg) {
  if (!msg) return null;
  if (msg.includes('Invalid credentials')) return 'That combination doesn’t match anything here.';
  if (msg.toLowerCase().includes('fetch')) return 'Couldn’t reach the server. Is it running?';
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.detail) return parsed.detail;
  } catch { /* not JSON */ }
  return msg;
}