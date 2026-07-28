import React from 'react';

const Crown = ({ color }) => (
  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
    <svg width="48" height="48" viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 2px 8px ${color}80)` }}>
      <path d="M2 20h20M4 20L5 8l4 4 3-7 3 7 4-4 1 12" />
    </svg>
  </div>
);

const PricingScreen = ({ isLanding }) => {
  return (
    <div className={isLanding ? '' : 'nm-main'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isLanding ? '40px 20px' : '60px 20px', overflowY: isLanding ? 'visible' : 'auto', position: 'relative' }}>
      
      {isLanding && (
        <button 
          onClick={() => window.location.href = '/'} 
          style={{ position: 'absolute', top: 40, left: 40, background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'color 0.2s', padding: 0 }}
          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--ink-3)'; }}
        >
          ← Back
        </button>
      )}

      <div style={{ textAlign: 'center', marginBottom: 60, marginTop: isLanding ? 40 : 0 }}>
        <h1 className="nm-h1" style={{ fontSize: 42, marginBottom: 16 }}>Plans & Pricing</h1>
        <p style={{ fontSize: 16, maxWidth: 600, margin: '0 auto', lineHeight: 1.6, color: 'var(--ink-3)', fontWeight: 400 }}>
          Unlock the full potential of your subconscious. Get more insights into your daily emotional loops and behavioral patterns with a premium subscription.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, maxWidth: 1000, width: '100%', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* Bronze Plan */}
        <div className="nm-card" style={{ flex: '1 1 300px', maxWidth: 320, display: 'flex', flexDirection: 'column', border: '1px solid #CD7F32', boxShadow: '0 8px 30px rgba(205, 127, 50, 0.15)' }}>
          <Crown color="#CD7F32" />
          <div className="nm-h2" style={{ marginBottom: 8, color: 'var(--ink-2)', textAlign: 'center' }}>Bronze</div>
          <div className="nm-meta" style={{ marginBottom: 24, minHeight: 44, textAlign: 'center' }}>Essential journaling and basic emotional tracking.</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>$</span>
            <span style={{ fontSize: 48, fontWeight: 700, color: 'var(--ink)' }}>9</span>
            <span className="nm-meta" style={{ fontSize: 16, marginLeft: 4 }}>/mo</span>
          </div>
          <button className="nm-btn accent" style={{ width: '100%', marginBottom: 32, background: '#CD7F32', color: '#fff', boxShadow: '0 4px 12px rgba(205, 127, 50, 0.4)' }}>Get Started</button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <FeatureItem text="Daily AI Journaling" />
            <FeatureItem text="Basic Emotion Tracking" />
            <FeatureItem text="7-day Reflection History" />
          </div>
        </div>

        {/* Silver Plan */}
        <div className="nm-card" style={{ flex: '1 1 300px', maxWidth: 320, display: 'flex', flexDirection: 'column', border: '2px solid var(--teal)', boxShadow: '0 8px 30px rgba(78, 205, 196, 0.25)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--teal)', color: 'var(--surface-0)', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>MOST POPULAR</div>
          <Crown color="#C0C0C0" />
          <div className="nm-h2" style={{ marginBottom: 8, color: 'var(--teal)', textAlign: 'center' }}>Silver</div>
          <div className="nm-meta" style={{ marginBottom: 24, minHeight: 44, textAlign: 'center' }}>Perfect for uncovering subconscious patterns.</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>$</span>
            <span style={{ fontSize: 48, fontWeight: 700, color: 'var(--ink)' }}>19</span>
            <span className="nm-meta" style={{ fontSize: 16, marginLeft: 4 }}>/mo</span>
          </div>
          <button className="nm-btn accent" style={{ width: '100%', marginBottom: 32, background: 'var(--teal)', color: '#fff', boxShadow: '0 4px 12px rgba(78, 205, 196, 0.4)' }}>Upgrade to Silver</button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <FeatureItem text="Everything in Bronze" />
            <FeatureItem text="Subconscious Loop Detection" />
            <FeatureItem text="Core Beliefs Profiling" />
            <FeatureItem text="30-day Insights Dashboard" />
          </div>
        </div>

        {/* Gold Plan */}
        <div className="nm-card" style={{ flex: '1 1 300px', maxWidth: 320, display: 'flex', flexDirection: 'column', border: '2px solid var(--accent)', boxShadow: '0 8px 30px rgba(255, 107, 107, 0.25)' }}>
          <Crown color="#FFD700" />
          <div className="nm-h2" style={{ marginBottom: 8, color: 'var(--accent)', textAlign: 'center' }}>Gold</div>
          <div className="nm-meta" style={{ marginBottom: 24, minHeight: 44, textAlign: 'center' }}>Full access to all AI features and unlimited history.</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>$</span>
            <span style={{ fontSize: 48, fontWeight: 700, color: 'var(--ink)' }}>39</span>
            <span className="nm-meta" style={{ fontSize: 16, marginLeft: 4 }}>/mo</span>
          </div>
          <button className="nm-btn accent" style={{ width: '100%', marginBottom: 32, background: 'var(--accent)', color: '#fff', boxShadow: '0 4px 12px rgba(255, 107, 107, 0.4)' }}>Upgrade to Gold</button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <FeatureItem text="Everything in Silver" />
            <FeatureItem text="Unlimited Reflection History" />
            <FeatureItem text="Advanced Toxicity & Risk Tracking" />
            <FeatureItem text="Custom Daily Questions" />
            <FeatureItem text="Priority AI Processing" />
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureItem = ({ text }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M13 4L6 11L3 8" />
    </svg>
    <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.4 }}>{text}</span>
  </div>
);

export default PricingScreen;
