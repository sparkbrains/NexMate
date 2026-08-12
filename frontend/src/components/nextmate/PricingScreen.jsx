import React from 'react';

const PLANS = [
  {
    key: 'basic',
    icon: '✦',
    iconColor: '#CD7F32',
    borderColor: '#CD7F32',
    shadow: 'rgba(205, 127, 50, 0.15)',
    nameColor: 'var(--ink-2)',
    label: 'Basic',
    tagline: 'Your first step toward self-awareness.',
    price: 'Free',
    priceSub: '2-day access',
    ctaLabel: 'Start for Free',
    ctaBg: '#CD7F32',
    ctaColor: '#fff',
    ctaShadow: 'rgba(205, 127, 50, 0.4)',
    badge: null,
    features: [
      { text: 'Daily journaling — write freely, reflect honestly' },
      { text: 'Insights dashboard with 2–3 emotional trend graphs' },
      { text: '2-day access to curated prompt packs' },
      { text: '2-day access to guided reflections' },
      { text: 'AI-powered customer support, always on' },
    ],
    note: 'No credit card required.',
  },
  {
    key: 'gold',
    icon: '◆',
    iconColor: '#FFD700',
    borderColor: '#b8860b',
    shadow: 'rgba(184, 134, 11, 0.25)',
    nameColor: '#b8860b',
    label: 'Gold',
    tagline: 'Thirty days of deeper clarity and momentum.',
    price: '$19',
    priceSub: '/ 30 days',
    ctaLabel: 'Unlock Gold',
    ctaBg: 'var(--land-gold)',
    ctaColor: '#2b2013',
    ctaShadow: 'rgba(184, 134, 11, 0.4)',
    badge: 'MOST POPULAR',
    badgeBg: '#b8860b',
    badgeColor: '#fff',
    features: [
      { text: 'Full journaling — include entries in your Loop, download as a personal book' },
      { text: 'Complete insights dashboard including the Knowledge Graph' },
      { text: 'All prompt packs, unlocked for 30 days' },
      { text: 'Guided reflections for 30 days' },
      { text: 'Your active Loop, visible and evolving for 30 days' },
    ],
    note: '30-day access. Renews manually.',
  },
  {
    key: 'platinum',
    icon: '❋',
    iconColor: '#C0C0C0',
    borderColor: 'var(--teal)',
    shadow: 'rgba(78, 205, 196, 0.25)',
    nameColor: 'var(--teal)',
    label: 'Platinum',
    tagline: 'A full year of transformation, uninterrupted.',
    price: '$59',
    priceSub: '/ 365 days',
    ctaLabel: 'Go Platinum',
    ctaBg: 'var(--teal)',
    ctaColor: '#fff',
    ctaShadow: 'rgba(78, 205, 196, 0.4)',
    badge: 'BEST VALUE',
    badgeBg: 'var(--teal)',
    badgeColor: 'var(--surface)',
    features: [
      { text: 'Full journaling with every option — Loop inclusion, book downloads, and more' },
      { text: 'Complete insights dashboard including the Knowledge Graph, for 365 days' },
      { text: 'All prompt packs, unlocked for 365 days' },
      { text: 'Guided reflections for 365 days' },
      { text: 'Your active Loop, visible and growing for 365 days' },
    ],
    note: 'Best value. One full year of growth.',
  },
];

const CheckIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
    <path d="M13 4L6 11L3 8" />
  </svg>
);

const PricingScreen = ({ isLanding }) => (
  <div
    className={isLanding ? '' : 'nm-main'}
    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isLanding ? '40px 20px 80px' : '60px 20px', overflowY: isLanding ? 'visible' : 'auto', position: 'relative' }}
  >
    {/* Header */}
    <div style={{ textAlign: 'center', marginBottom: 64, marginTop: isLanding ? 24 : 0, maxWidth: 620 }}>
      <h1 className="nm-h1" style={{ fontSize: 42, marginBottom: 16 }}>Plans & Pricing</h1>
      <p style={{ fontSize: 16, maxWidth: 600, margin: '0 auto', lineHeight: 1.6, color: 'var(--ink-3)', fontWeight: 400 }}>
        Unlock the full potential of your subconscious. Get more insights into your daily emotional loops and behavioral patterns with a premium subscription.
      </p>
    </div>

    {/* Cards */}
    <div style={{ display: 'flex', gap: 24, maxWidth: 1060, width: '100%', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'stretch' }}>
      {PLANS.map((plan) => (
        <div
          key={plan.key}
          className="nm-card"
          style={{
            flex: '1 1 300px',
            maxWidth: 330,
            display: 'flex',
            flexDirection: 'column',
            border: `${plan.key === 'gold' ? '2px' : '1px'} solid ${plan.borderColor}`,
            boxShadow: `0 8px 32px ${plan.shadow}`,
            position: 'relative',
            padding: '32px 28px 28px',
          }}
        >
          {/* Badge */}
          {plan.badge && (
            <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: plan.badgeBg, color: plan.badgeColor, padding: '4px 14px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              {plan.badge}
            </div>
          )}

          {/* Icon + Name */}
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 32, color: plan.iconColor, filter: `drop-shadow(0 2px 6px ${plan.shadow})` }}>{plan.icon}</span>
          </div>
          <div className="nm-h2" style={{ textAlign: 'center', color: plan.nameColor, marginBottom: 8 }}>{plan.label}</div>
          <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 24, minHeight: 40 }}>{plan.tagline}</p>

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: plan.price === 'Free' ? 40 : 48, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{plan.price}</span>
          </div>
          <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em', marginBottom: 28 }}>{plan.priceSub}</p>

          {/* CTA */}
          <button
            className="nm-btn"
            style={{ width: '100%', marginBottom: 28, background: plan.ctaBg, color: plan.ctaColor, border: 'none', boxShadow: `0 4px 14px ${plan.ctaShadow}`, borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', justifyContent: 'center' }}
          >
            {plan.ctaLabel}
          </button>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            {plan.features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <CheckIcon color={plan.iconColor} />
                <span style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{f.text}</span>
              </div>
            ))}
          </div>

          {/* Note */}
          <p style={{ marginTop: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.04em' }}>{plan.note}</p>
        </div>
      ))}
    </div>

    {/* Footer note */}
    <p style={{ marginTop: 48, fontSize: 13, color: 'var(--ink-4)', textAlign: 'center', maxWidth: 480, lineHeight: 1.6 }}>
      All plans include end-to-end encrypted storage. Your journal is yours — private, always.
    </p>
  </div>
);

export default PricingScreen;
