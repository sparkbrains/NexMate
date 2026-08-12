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
    <div className="nm-land">

      {/* Top Navbar */}
      <nav className="nm-land-nav">
        <img src={LogoIco} alt="Nextmate" height="30" className="nm-logo" />
        <div className="nm-land-nav-actions">
          <button className="nm-land-nav-link" onClick={() => window.open('/pricing', '_blank')}>Pricing</button>
          <button className="nm-land-nav-link" onClick={() => navigate('/login')}>Sign In</button>
          <button className="nm-land-nav-cta" onClick={() => navigate('/signup')}>Make a Space</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="nm-land-hero">
        <img className="nm-land-sticker nm-land-sticker-bl-1" src="/stickers/picnic/strawberry.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-bl-2" src="/stickers/picnic/gingham-star.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-bl-3" src="/stickers/scrapbook/butterfly.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-bl-4" src="/stickers/scrapbook/starry-night.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-bl-5" src="/stickers/picnic/star-patch.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-bl-6" src="/stickers/picnic/apple-slice.png" alt="" aria-hidden="true" />

        <img className="nm-land-sticker nm-land-sticker-br-1" src="/stickers/scrapbook/great-wave.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-br-2" src="/stickers/picnic/jam-jar.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-br-3" src="/stickers/picnic/cherry-candy.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-br-4" src="/stickers/scrapbook/flower-spray.png" alt="" aria-hidden="true" />
        <img className="nm-land-sticker nm-land-sticker-br-5" src="/stickers/picnic/gingham-heart.png" alt="" aria-hidden="true" />

        <div className="nm-land-eyebrow">
          NexMate · <span className="nm-land-eyebrow-em">a quiet place to think out loud</span>
        </div>

        <h1 className="nm-land-headline">
          Unlock your <em>subconscious</em> potential.
        </h1>

        <p className="nm-land-sub">
          Track daily emotional loops, uncover hidden behavioral patterns, and build a powerful thinking practice. NexMate provides unhurried reflection to help you understand your mind.
        </p>

        <button className="nm-land-cta" onClick={() => navigate('/signup')}>
          Start Journaling
        </button>

        <div className="nm-land-chips">
          <span className="nm-land-chip">90 days of memory</span>
          <span className="nm-land-chip">unhurried reflection</span>
          <span className="nm-land-chip">pattern-spotting, not grading</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="nm-land-footer">
        <img className="nm-land-footer-sticker" src="/stickers/picnic/croissant.png" alt="" aria-hidden="true" />
        © {new Date().getFullYear()} Nexmate. All rights reserved.
      </footer>
    </div>
  );
};
