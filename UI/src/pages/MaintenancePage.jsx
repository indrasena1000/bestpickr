// src/pages/MaintenancePage.jsx
export default function MaintenancePage({ message, eta }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--paper2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>

        {/* Animated wrench */}
        <div style={{ fontSize: 72, marginBottom: 24, display: 'inline-block', animation: 'bp-spin 3s linear infinite' }}>
          🔧
        </div>

        {/* Brand */}
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, letterSpacing: '-.3px' }}>
          <span style={{ color: 'var(--accent)' }}>best</span>
          <span style={{ color: 'var(--accent2)' }}>pickr</span>
        </div>

        {/* Main message */}
        <h1 style={{ fontSize: 'clamp(20px,4vw,28px)', fontWeight: 700, color: 'var(--ink)', marginBottom: 14, letterSpacing: '-.4px', lineHeight: 1.3 }}>
          We'll be back shortly
        </h1>

        <p style={{ fontSize: 15, color: 'var(--ink3)', lineHeight: 1.7, marginBottom: 20 }}>
          {message || 'bestpickr is currently undergoing scheduled maintenance to improve your experience.'}
        </p>

        {eta && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--accent-bg)',
            border: '1px solid #C8E6D4',
            borderRadius: 'var(--r2)',
            padding: '10px 18px',
            fontSize: 14,
            color: 'var(--accent)',
            fontWeight: 600,
            marginBottom: 28,
          }}>
            ⏱️ Estimated back in: <strong>{eta}</strong>
          </div>
        )}

        <div style={{
          background: 'var(--paper)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r3)',
          padding: '20px 24px',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
            What we're working on:
          </div>
          {[
            '⚡ Improving search speed & results quality',
            '🤖 Updating our AI ranking models',
            '🛒 Refreshing product data from Amazon & Flipkart',
          ].map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--ink3)', padding: '5px 0', borderBottom: i < 2 ? '1px solid var(--line)' : 'none', lineHeight: 1.6 }}>
              {item}
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: 'var(--ink4)', lineHeight: 1.6 }}>
          Questions? Email us at{' '}
          <a href="mailto:hello@bestpickr.in" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            hello@bestpickr.in
          </a>
        </p>

        <style>{`
          @keyframes bp-spin {
            0%   { transform: rotate(-15deg); }
            25%  { transform: rotate(15deg);  }
            50%  { transform: rotate(-15deg); }
            75%  { transform: rotate(15deg);  }
            100% { transform: rotate(-15deg); }
          }
        `}</style>
      </div>
    </div>
  )
}
