import { useEffect, useMemo, useRef, useState } from 'react';
import {
  login,
  signupRequestOtp,
  signupVerifyOtp,
  resendSignupOtp,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resendPasswordResetOtp,
  resetPassword,
} from '../../lib/api';
import { BrandMark } from './Shell';

const QUOTES = [
  "The thought you keep circling is trying to tell you something.",
  "Rest is not the opposite of work. It's part of the work.",
  "You don't have to finish the thought. You have to begin it.",
  "What you notice is what becomes you.",
];

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds

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

// entry numbers shown in the pane header, keyed by mode
const ENTRY_NO = {
  login: '001',
  signup: '002',
  otp: '003',
  forgot: '004',
  'forgot-otp': '005',
  reset: '006',
};

export function AuthGate({ onAuth }) {
  // mode: 'login' | 'signup' | 'otp' | 'forgot' | 'forgot-otp' | 'reset'
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const otpRefs = useRef([]);

  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);
  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isOtp = mode === 'otp';
  const isForgotEmail = mode === 'forgot';
  const isForgotOtp = mode === 'forgot-otp';
  const isReset = mode === 'reset';
  const anyOtpStep = isOtp || isForgotOtp;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (anyOtpStep) otpRefs.current[0]?.focus();
  }, [anyOtpStep]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (isLogin) {
        const data = await login(email.trim(), password);
        onAuth(data.user);
      } else {
        // Step 1 of signup: request an OTP be sent to the email.
        // Backend stores the pending signup (email + hashed password) keyed
        // to the OTP, and only creates the user once it's verified.
        await signupRequestOtp(email.trim(), password);
        setCooldown(RESEND_COOLDOWN);
        setMode('otp');
      }
    } catch (ex) {
      setErr(prettyError(ex.message) || 'Something didn’t connect. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (busy || code.length !== OTP_LENGTH) return;
    setBusy(true); setErr(null);
    try {
      // Step 2 of signup: verify the code. On success the backend creates
      // the account and returns the same shape login() does.
      const data = await signupVerifyOtp(email.trim(), code);
      onAuth(data.user);
    } catch (ex) {
      setErr(prettyError(ex.message) || 'That code didn’t work. Try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true); setErr(null);
    try {
      if (isForgotOtp) {
        await resendPasswordResetOtp(email.trim());
      } else {
        await resendSignupOtp(email.trim());
      }
      setCooldown(RESEND_COOLDOWN);
      setOtp(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } catch (ex) {
      setErr(prettyError(ex.message) || 'Couldn’t resend the code. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const handleOtpChange = (i, val) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < OTP_LENGTH - 1) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    setOtp((prev) => {
      const next = [...prev];
      for (let i = 0; i < OTP_LENGTH; i++) next[i] = text[i] || '';
      return next;
    });
    otpRefs.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  const toggle = () => {
    setErr(null);
    setNotice(null);
    setMode(isLogin ? 'signup' : 'login');
  };

  const backToSignup = () => {
    setErr(null);
    setOtp(Array(OTP_LENGTH).fill(''));
    setMode('signup');
  };

  // --- forgot password ---------------------------------------------------

  const goToForgot = () => {
    setErr(null);
    setNotice(null);
    setOtp(Array(OTP_LENGTH).fill(''));
    setMode('forgot');
  };

  const backToLogin = () => {
    setErr(null);
    setOtp(Array(OTP_LENGTH).fill(''));
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMode('login');
  };

  const backToForgotEmail = () => {
    setErr(null);
    setOtp(Array(OTP_LENGTH).fill(''));
    setMode('forgot');
  };

  const submitForgotEmail = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); setNotice(null);
    try {
      // Backend deliberately doesn't reveal whether the email exists —
      // it always resolves quietly. We advance the same way either way.
      await requestPasswordResetOtp(email.trim());
      setCooldown(RESEND_COOLDOWN);
      setMode('forgot-otp');
    } catch (ex) {
      setErr(prettyError(ex.message) || 'Something didn’t connect. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitForgotOtp = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (busy || code.length !== OTP_LENGTH) return;
    setBusy(true); setErr(null);
    try {
      await verifyPasswordResetOtp(email.trim(), code);
      setMode('reset');
    } catch (ex) {
      setErr(prettyError(ex.message) || 'That code didn’t work. Try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (newPassword.length < 6) {
      setErr('Use at least six characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('Those two don’t match yet.');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const code = otp.join('');
      await resetPassword(email.trim(), code, newPassword);
      setNotice('Password updated. Sign in with your new one.');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOtp(Array(OTP_LENGTH).fill(''));
      setMode('login');
    } catch (ex) {
      setErr(prettyError(ex.message) || 'Couldn’t update your password. Try again.');
    } finally {
      setBusy(false);
    }
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
            {isLogin && (
              <>Come back to the <em>thought</em><br />you were having.</>
            )}
            {isSignup && (
              <>Begin a <em>thinking</em><br />practice.</>
            )}
            {isOtp && (
              <>Check the <em>inbox</em><br />you gave us.</>
            )}
            {isForgotEmail && (
              <>Let's find your <em>way</em><br />back in.</>
            )}
            {isForgotOtp && (
              <>Check the <em>inbox</em><br />you gave us.</>
            )}
            {isReset && (
              <>Choose a new <em>word</em><br />to remember.</>
            )}
          </h1>

          <p className="nm-auth-sub nm-reveal" data-d="4">
            {isLogin &&
              "It’s been waiting. Nothing here is graded, indexed, or optimised — only noticed."}
            {isSignup &&
              "Ninety days of memory. Unhurried reflection. Patterns you couldn’t see from inside the week."}
            {isOtp &&
              `We sent a six-digit code to ${email || 'your email'}. It's good for a few minutes — bring it back here.`}
            {isForgotEmail &&
              "Tell us the email you write from. We'll send a code to get you back in."}
            {isForgotOtp &&
              `We sent a six-digit code to ${email || 'your email'}. It's good for a few minutes — bring it back here.`}
            {isReset &&
              "Pick something you'll remember next time. This closes your other sessions too."}
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
          <span>
            {isLogin && 'To return —'}
            {isSignup && 'To begin —'}
            {isOtp && 'One more step —'}
            {isForgotEmail && 'To reset —'}
            {isForgotOtp && 'One more step —'}
            {isReset && 'Almost there —'}
          </span>
          <span className="entry-no">no. {ENTRY_NO[mode]}</span>
        </div>

        {notice && !isLogin && <div className="nm-auth-notice">{notice}</div>}

        {(isLogin || isSignup) && (
          <form onSubmit={submit} className="nm-auth-form nm-reveal" data-d="3" noValidate>
            <h2 className="nm-auth-title">
              {isLogin ? <>Sign <em>in.</em></> : <>Make <em>room.</em></>}
            </h2>

            {isLogin && notice && <div className="nm-auth-notice">{notice}</div>}

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

            {isLogin && (
              <button
                className="nm-auth-inline-link"
                type="button"
                onClick={goToForgot}
              >
                Forgot your password?
              </button>
            )}

            {err && <div className="nm-auth-err">{err}</div>}

            <button className="nm-auth-submit" type="submit" disabled={busy}>
              <span>
                {busy
                  ? (isLogin ? 'Returning' : 'Sending a code')
                  : isLogin ? <>Return<em>.</em></> : <>Continue<em>.</em></>}
              </span>
              <span className="arrow" aria-hidden>→</span>
            </button>
          </form>
        )}

        {isOtp && (
          <form onSubmit={submitOtp} className="nm-auth-form nm-reveal" data-d="3" noValidate>
            <h2 className="nm-auth-title">
              Enter the <em>code.</em>
            </h2>

            <div className="nm-field">
              <label className="nm-field-label">6-digit code</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    className="nm-field-input"
                    style={{ textAlign: 'center', width: 44, padding: '10px 0', fontFamily: 'var(--font-mono)', fontSize: 18 }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={handleOtpPaste}
                  />
                ))}
              </div>
              <span className="nm-field-mark" />
            </div>

            {err && <div className="nm-auth-err">{err}</div>}

            <button
              className="nm-auth-submit"
              type="submit"
              disabled={busy || otp.join('').length !== OTP_LENGTH}
            >
              <span>{busy ? 'Verifying' : <>Verify &amp; enter<em>.</em></>}</span>
              <span className="arrow" aria-hidden>→</span>
            </button>
          </form>
        )}

        {isForgotEmail && (
          <form onSubmit={submitForgotEmail} className="nm-auth-form nm-reveal" data-d="3" noValidate>
            <h2 className="nm-auth-title">
              Reset your <em>password.</em>
            </h2>

            <div className="nm-field">
              <label htmlFor="nm-forgot-email" className="nm-field-label">Email</label>
              <input
                id="nm-forgot-email"
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

            {err && <div className="nm-auth-err">{err}</div>}

            <button className="nm-auth-submit" type="submit" disabled={busy || !email.trim()}>
              <span>{busy ? 'Sending a code' : <>Send code<em>.</em></>}</span>
              <span className="arrow" aria-hidden>→</span>
            </button>
          </form>
        )}

        {isForgotOtp && (
          <form onSubmit={submitForgotOtp} className="nm-auth-form nm-reveal" data-d="3" noValidate>
            <h2 className="nm-auth-title">
              Enter the <em>code.</em>
            </h2>

            <div className="nm-field">
              <label className="nm-field-label">6-digit code</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    className="nm-field-input"
                    style={{ textAlign: 'center', width: 44, padding: '10px 0', fontFamily: 'var(--font-mono)', fontSize: 18 }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={handleOtpPaste}
                  />
                ))}
              </div>
              <span className="nm-field-mark" />
            </div>

            {err && <div className="nm-auth-err">{err}</div>}

            <button
              className="nm-auth-submit"
              type="submit"
              disabled={busy || otp.join('').length !== OTP_LENGTH}
            >
              <span>{busy ? 'Verifying' : <>Verify code<em>.</em></>}</span>
              <span className="arrow" aria-hidden>→</span>
            </button>
          </form>
        )}

        {isReset && (
          <form onSubmit={submitReset} className="nm-auth-form nm-reveal" data-d="3" noValidate>
            <h2 className="nm-auth-title">
              New <em>password.</em>
            </h2>

            <div className="nm-field">
              <label htmlFor="nm-new-pass" className="nm-field-label">New password</label>
              <input
                id="nm-new-pass"
                className="nm-field-input"
                type="password"
                autoComplete="new-password"
                placeholder="at least six characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
              />
              <span className="nm-field-mark" />
            </div>

            <div className="nm-field">
              <label htmlFor="nm-confirm-pass" className="nm-field-label">Confirm password</label>
              <input
                id="nm-confirm-pass"
                className="nm-field-input"
                type="password"
                autoComplete="new-password"
                placeholder="type it once more"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
              <span className="nm-field-mark" />
            </div>

            {err && <div className="nm-auth-err">{err}</div>}

            <button
              className="nm-auth-submit"
              type="submit"
              disabled={busy || !newPassword || !confirmPassword}
            >
              <span>{busy ? 'Saving' : <>Save &amp; sign in<em>.</em></>}</span>
              <span className="arrow" aria-hidden>→</span>
            </button>
          </form>
        )}

        <div className="nm-reveal" data-d="5" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(isLogin || isSignup) && (
            <button className="nm-auth-toggle" onClick={toggle} type="button">
              {isLogin ? <>New here? <u>Make a space</u></> : <>Been here before? <u>Sign in</u></>}
            </button>
          )}
          {isOtp && (
            <>
              <button
                className="nm-auth-toggle"
                onClick={handleResend}
                type="button"
                disabled={cooldown > 0 || busy}
              >
                {cooldown > 0 ? <>Resend code in {cooldown}s</> : <>Didn’t get it? <u>Resend code</u></>}
              </button>
              <button className="nm-auth-toggle" onClick={backToSignup} type="button">
                <u>Use a different email</u>
              </button>
            </>
          )}
          {isForgotEmail && (
            <button className="nm-auth-toggle" onClick={backToLogin} type="button">
              <u>Back to sign in</u>
            </button>
          )}
          {isForgotOtp && (
            <>
              <button
                className="nm-auth-toggle"
                onClick={handleResend}
                type="button"
                disabled={cooldown > 0 || busy}
              >
                {cooldown > 0 ? <>Resend code in {cooldown}s</> : <>Didn’t get it? <u>Resend code</u></>}
              </button>
              <button className="nm-auth-toggle" onClick={backToForgotEmail} type="button">
                <u>Use a different email</u>
              </button>
            </>
          )}
          {isReset && (
            <button className="nm-auth-toggle" onClick={backToLogin} type="button">
              <u>Back to sign in</u>
            </button>
          )}
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