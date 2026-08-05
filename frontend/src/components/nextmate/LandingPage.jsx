import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthGate } from './AuthGate';
import LogoIco from '../../assets/ic_logo.svg';

export const LandingPage = ({ onAuth, authMode = null }) => {
  const navigate = useNavigate();

  if (authMode) {
    return <AuthGate key={authMode} onAuth={onAuth} initialMode={authMode} onBack={() => navigate('/')} />;
  }

  return (
    <div style={{ height: '100vh', width: '100vw', overflowY: 'auto', overflowX: 'hidden', background: '#eae4f3' }}>
      
      {/* Top Navbar */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 40px', position: 'sticky', top: 0, background: 'rgba(234, 228, 243, 0.9)', backdropFilter: 'blur(10px)', zIndex: 100 }}>
        <img src={LogoIco} alt="Nextmate" height="30" className="nm-logo" />
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <button onClick={() => window.open('/pricing', '_blank')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Pricing</button>
          <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Sign In</button>
          <button onClick={() => navigate('/signup')} style={{ background: 'var(--ink)', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Make a Space</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 20px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 24 }}>
          NexMate · <span style={{ color: 'var(--accent)', fontStyle: 'italic', textTransform: 'none', fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '-0.01em' }}>a quiet place to think out loud</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 500, lineHeight: 1.1, letterSpacing: '-0.018em', color: 'var(--ink)', maxWidth: 800, marginBottom: 24 }}>
          Unlock your <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>subconscious</em> potential.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.5, color: 'var(--ink-3)', maxWidth: 600, marginBottom: 40 }}>
          Track daily emotional loops, uncover hidden behavioral patterns, and build a powerful thinking practice. NexMate provides unhurried reflection to help you understand your mind.
        </p>
        <button onClick={() => navigate('/signup')} style={{ background: 'var(--ink)', color: '#ffffff', border: 'none', padding: '16px 32px', borderRadius: 30, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Start Journaling
        </button>
      </section>



      {/* Footer */}
      <footer style={{ padding: '40px', textAlign: 'center', borderTop: '1px solid var(--rule)', background: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        © {new Date().getFullYear()} Nexmate. All rights reserved.
      </footer>
    </div>
  );
};
