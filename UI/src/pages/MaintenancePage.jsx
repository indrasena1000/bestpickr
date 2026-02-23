// src/pages/MaintenancePage.jsx
// Launching Soon page — shown when maintenance mode is ON

export default function MaintenancePage({ message, eta }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080e0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Ambient glow blobs ── */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          background:
            "radial-gradient(circle, rgba(26,107,60,0.18) 0%, transparent 70%)",
          top: "-10%",
          left: "-10%",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          background:
            "radial-gradient(circle, rgba(244,149,107,0.10) 0%, transparent 70%)",
          bottom: "-5%",
          right: "-5%",
          pointerEvents: "none",
        }}
      />

      {/* ── Grid texture ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: `
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />

      {/* ── Floating review chips ── */}
      {[
        { text: "⭐ 8.9 AI Score", top: "12%", left: "6%", delay: "0s" },
        {
          text: "✅ Authentic Reviews",
          top: "20%",
          right: "8%",
          delay: "0.6s",
        },
        {
          text: "💰 Best Price: ₹23,999",
          bottom: "28%",
          left: "4%",
          delay: "1.2s",
        },
        {
          text: "🛒 Amazon vs Flipkart",
          bottom: "18%",
          right: "6%",
          delay: "0.3s",
        },
        { text: "🤖 GPT-4 Analysis", top: "38%", left: "2%", delay: "0.9s" },
        { text: "📊 47 Reviews Read", top: "55%", right: "3%", delay: "1.5s" },
      ].map((chip, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: chip.top,
            bottom: chip.bottom,
            left: chip.left,
            right: chip.right,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 100,
            padding: "7px 14px",
            fontSize: 12,
            color: "rgba(255,255,255,0.45)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            backdropFilter: "blur(8px)",
            animation: `bp-drift 4s ease-in-out infinite`,
            animationDelay: chip.delay,
            display: window.innerWidth < 640 ? "none" : "block",
          }}
        >
          {chip.text}
        </div>
      ))}

      {/* ── Main card ── */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: 560,
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Logo — matches Navbar exactly */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "#1A6B3C",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 0 20px rgba(26,107,60,0.5)",
              animation: "bp-glow 2s ease-in-out infinite",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 17 17" fill="none">
              <path
                d="M4 8.5L7 11.5L13 5.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: "-0.5px",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#5dba85" }}>best</span>
            <span style={{ color: "white" }}>pickr</span>
            <span style={{ color: "#F4956B", fontSize: 26 }}>.</span>
          </span>
        </div>

        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(26,107,60,0.2)",
            border: "1px solid rgba(93,186,133,0.3)",
            borderRadius: 100,
            padding: "6px 16px",
            marginBottom: 28,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              background: "#5dba85",
              borderRadius: "50%",
              display: "inline-block",
              animation: "bp-pulse 1.4s ease-in-out infinite",
              boxShadow: "0 0 6px #5dba85",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#5dba85",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            Launching Soon
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: "clamp(28px, 6vw, 48px)",
            fontWeight: 900,
            color: "white",
            lineHeight: 1.15,
            letterSpacing: "-1.5px",
            marginBottom: 20,
          }}
        >
          Stop guessing.
          <br />
          <span
            style={{
              background: "linear-gradient(90deg, #5dba85, #A8DFC0)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Buy smarter.
          </span>
        </h1>

        {/* Subtext */}
        <p
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.75,
            marginBottom: 36,
            maxWidth: 420,
            margin: "0 auto 36px",
          }}
        >
          {message || (
            <>
              India's first AI that reads{" "}
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>
                thousands of real reviews
              </strong>
              , detects fake ones, and tells you exactly which product is worth
              your money — across Amazon, Flipkart & Myntra.
            </>
          )}
        </p>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
            marginBottom: 36,
          }}
        >
          {[
            { icon: "🤖", label: "AI Review Analysis" },
            { icon: "🔍", label: "Fake Review Detection" },
            { icon: "💸", label: "Best Price Across 3 Platforms" },
            { icon: "📈", label: "Price History Trends" },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 100,
                padding: "8px 16px",
                fontSize: 13,
                color: "rgba(255,255,255,0.7)",
                fontWeight: 500,
                animation: "bp-fadein 0.5s ease both",
                animationDelay: `${i * 0.1}s`,
              }}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>

        {/* ETA pill */}
        {eta && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(244,149,107,0.1)",
              border: "1px solid rgba(244,149,107,0.25)",
              borderRadius: 100,
              padding: "10px 20px",
              fontSize: 13,
              color: "#F4956B",
              fontWeight: 600,
              marginBottom: 32,
            }}
          >
            ⏱️ Expected launch in:{" "}
            <strong style={{ color: "white" }}>{eta}</strong>
          </div>
        )}

        {/* ── Blog CTA — read while you wait ── */}
        <a
          href="/#/blog"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(93,186,133,0.1)',
            border: '1.5px solid rgba(93,186,133,0.35)',
            borderRadius: 14,
            padding: '14px 22px',
            marginBottom: 36,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'background 0.2s, border-color 0.2s',
            width: '100%',
            boxSizing: 'border-box',
            textAlign: 'left',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(93,186,133,0.18)'; e.currentTarget.style.borderColor = 'rgba(93,186,133,0.6)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(93,186,133,0.1)'; e.currentTarget.style.borderColor = 'rgba(93,186,133,0.35)' }}
        >
          <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>📖</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#5dba85', marginBottom: 3 }}>
              Read our Tech Blog while we launch →
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
              Daily buying guides, deals & tech facts for Indian buyers
            </div>
          </div>
        </a>

        {/* Social proof line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            marginBottom: 32,
            flexWrap: "wrap",
          }}
        >
          {[
            { num: "50,000+", label: "Reviews Analyzed" },
            { num: "3", label: "Platforms Compared" },
            { num: "100%", label: "Free to Use" },
          ].map((stat, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "white",
                  letterSpacing: "-0.5px",
                }}
              >
                {stat.num}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
            marginBottom: 24,
          }}
        />

        {/* Footer */}
        <p
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.3)",
            lineHeight: 1.6,
          }}
        >
          Questions? Write to us at{" "}
          <a
            href="mailto:hello@bestpickr.in"
            style={{
              color: "#5dba85",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            hello@bestpickr.in
          </a>
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');

        @keyframes bp-drift {
          0%, 100% { transform: translateY(0px); opacity: 0.6; }
          50% { transform: translateY(-10px); opacity: 1; }
        }
        @keyframes bp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes bp-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(26,107,60,0.5); }
          50% { box-shadow: 0 0 35px rgba(26,107,60,0.9), 0 0 60px rgba(26,107,60,0.3); }
        }
        @keyframes bp-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
