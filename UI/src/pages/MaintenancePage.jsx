// src/pages/MaintenancePage.jsx
// BUG #12 FIX: Replaced boring 🔧 wrench with animated robot/AI theme — more on-brand for bestpickr

export default function MaintenancePage({ message, eta }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f2318 0%, #1A6B3C 50%, #0f2318 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background animated dots */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {[...Array(20)].map((_, i) => (
          <div key={i} style={{
            position:'absolute',
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '50%',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `bp-float ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
          }}/>
        ))}
      </div>

      <div style={{ textAlign: 'center', maxWidth: 520, position:'relative', zIndex:1 }}>

        {/* Animated AI Robot — BUG #12 FIX */}
        <div style={{ marginBottom: 28, position:'relative', display:'inline-block' }}>
          {/* Robot head */}
          <div style={{
            width: 96, height: 96, background: 'rgba(255,255,255,0.12)',
            border: '3px solid rgba(255,255,255,0.3)',
            borderRadius: 20, margin: '0 auto',
            display:'flex', alignItems:'center', justifyContent:'center',
            backdropFilter: 'blur(10px)',
            animation: 'bp-bob 2s ease-in-out infinite',
            position:'relative',
          }}>
            {/* Eyes */}
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              <div style={{
                width:14, height:14, background:'#7ECFA0',
                borderRadius:'50%', animation:'bp-blink 3s ease-in-out infinite',
                boxShadow:'0 0 12px #7ECFA0',
              }}/>
              <div style={{
                width:14, height:14, background:'#7ECFA0',
                borderRadius:'50%', animation:'bp-blink 3s ease-in-out infinite 0.1s',
                boxShadow:'0 0 12px #7ECFA0',
              }}/>
            </div>
            {/* Signal waves */}
            <div style={{
              position:'absolute', top:-8, right:-8,
              width:16, height:16,
            }}>
              <div style={{ width:8, height:8, border:'2px solid #F4956B', borderRadius:'50%', position:'absolute', top:0, right:0, animation:'bp-ping 1.5s ease-in-out infinite' }}/>
            </div>
          </div>
          {/* Antenna */}
          <div style={{
            width:3, height:24, background:'rgba(255,255,255,0.4)',
            margin:'-4px auto 0', borderRadius:2,
          }}/>
          <div style={{
            width:8, height:8, background:'#F4956B',
            borderRadius:'50%', margin:'-4px auto 0',
            boxShadow:'0 0 8px #F4956B',
            animation:'bp-pulse 1s ease-in-out infinite',
          }}/>
        </div>

        {/* Brand */}
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, letterSpacing:'-0.5px' }}>
          <span style={{ color: '#A8DFC0' }}>best</span>
          <span style={{ color: 'white' }}>pickr</span>
          <span style={{ color: '#F4956B' }}>.</span>
        </div>

        <h1 style={{
          fontSize: 'clamp(20px,4vw,28px)', fontWeight: 700,
          color: 'white', marginBottom: 14, letterSpacing:'-.4px', lineHeight: 1.3,
        }}>
          Our AI is getting smarter 🧠
        </h1>

        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, marginBottom: 20 }}>
          {message || 'bestpickr is undergoing scheduled maintenance to bring you even better AI product rankings.'}
        </p>

        {eta && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 'var(--r2)', padding: '10px 18px',
            fontSize: 14, color: '#A8DFC0', fontWeight: 600, marginBottom: 28,
          }}>
            ⏱️ Estimated back in: <strong style={{ color:'white' }}>{eta}</strong>
          </div>
        )}

        <div style={{
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 'var(--r3)', padding: '20px 24px', marginBottom: 24,
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 10 }}>
            What we're upgrading:
          </div>
          {[
            ['⚡', 'Faster search & better AI rankings'],
            ['🤖', 'Improved review sentiment analysis'],
            ['🛒', 'More products from Amazon & Flipkart'],
            ['📊', 'Enhanced price comparison engine'],
          ].map(([icon, text], i) => (
            <div key={i} style={{
              fontSize: 13, color: 'rgba(255,255,255,0.7)',
              padding: '7px 0',
              borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.1)' : 'none',
              lineHeight: 1.6, display:'flex', gap:8, alignItems:'center',
            }}>
              <span style={{ fontSize:16 }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
          Questions? Email us at{' '}
          <a href="mailto:hello@bestpickr.in" style={{ color: '#A8DFC0', fontWeight: 600 }}>
            hello@bestpickr.in
          </a>
        </p>

        <style>{`
          @keyframes bp-bob {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          @keyframes bp-blink {
            0%, 90%, 100% { transform: scaleY(1); opacity: 1; }
            95% { transform: scaleY(0.1); opacity: 0.5; }
          }
          @keyframes bp-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
          }
          @keyframes bp-ping {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
          }
          @keyframes bp-float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0.15; }
            50% { transform: translateY(-20px) translateX(10px); opacity: 0.4; }
          }
        `}</style>
      </div>
    </div>
  )
}
