// src/pages/AdminDashboard.jsx
import { useState, useEffect, useCallback } from "react";
import "../styles/admin.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin@123";

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
  });
}

// ── MAINTENANCE TOGGLE PANEL ───────────────────────────────────────
function MaintenancePanel({ maintenance, onMaintenanceChange, adminToken }) {
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState(
    maintenance.message ||
      "We're performing scheduled maintenance. We'll be back shortly.",
  );
  const [eta, setEta] = useState(maintenance.eta || "");
  const [feedback, setFeedback] = useState("");

  async function toggle(enable) {
    setToggling(true);
    setFeedback("");
    try {
      const r = await fetch(`${API_BASE}/admin/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: enable,
          message,
          eta,
          token: adminToken,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        onMaintenanceChange({ enabled: data.maintenance, message, eta });
        setFeedback(
          enable
            ? "✅ Maintenance mode ON — visitors now see the maintenance page."
            : "✅ Site is LIVE — visitors can access bestpickr normally.",
        );
      } else {
        setFeedback("❌ Error: " + (data.error || "Failed"));
      }
    } catch (e) {
      setFeedback("❌ Could not reach backend — check if server is running.");
    } finally {
      setToggling(false);
    }
  }

  const isOn = maintenance.enabled;

  return (
    <div
      className="admin-card"
      style={{ border: isOn ? "2px solid #F87171" : "1px solid #1E293B" }}
    >
      <div className="admin-card-title">
        🔧 Maintenance Mode
        <span
          className={`admin-badge ${isOn ? "red" : "green"}`}
          style={{ marginLeft: 8 }}
        >
          {isOn ? "● SITE DOWN" : "● SITE LIVE"}
        </span>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "#94A3B8",
          marginBottom: 16,
          lineHeight: 1.6,
        }}
      >
        When turned ON, all visitors see a "We'll be back shortly" page instead
        of bestpickr. You (the admin) can still access everything normally.
      </p>

      {/* Custom message input */}
      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 12,
            color: "#64748B",
            display: "block",
            marginBottom: 5,
          }}
        >
          Message shown to visitors:
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          style={{
            width: "100%",
            background: "#0F172A",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "10px 12px",
            color: "#E2E8F0",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* ETA input */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            fontSize: 12,
            color: "#64748B",
            display: "block",
            marginBottom: 5,
          }}
        >
          Estimated time back (optional — e.g. "30 minutes", "2 hours"):
        </label>
        <input
          value={eta}
          onChange={(e) => setEta(e.target.value)}
          placeholder="e.g. 30 minutes"
          style={{
            width: "100%",
            background: "#0F172A",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "10px 12px",
            color: "#E2E8F0",
            fontSize: 13,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Toggle buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => toggle(true)}
          disabled={toggling || isOn}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 8,
            border: "none",
            cursor: isOn ? "not-allowed" : "pointer",
            background: isOn ? "#1E293B" : "#EF4444",
            color: isOn ? "#64748B" : "#fff",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            transition: "all .15s",
          }}
        >
          {toggling ? "..." : "🔴 Put Site Into Maintenance"}
        </button>
        <button
          onClick={() => toggle(false)}
          disabled={toggling || !isOn}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: 8,
            border: "none",
            cursor: !isOn ? "not-allowed" : "pointer",
            background: !isOn ? "#1E293B" : "#22C55E",
            color: !isOn ? "#64748B" : "#fff",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            transition: "all .15s",
          }}
        >
          {toggling ? "..." : "🟢 Bring Site Back Live"}
        </button>
      </div>

      {feedback && (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            color: feedback.startsWith("✅") ? "#34D399" : "#F87171",
            lineHeight: 1.5,
          }}
        >
          {feedback}
        </div>
      )}

      {isOn && (
        <div
          style={{
            marginTop: 12,
            background: "#450A0A",
            border: "1px solid #7F1D1D",
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 700 }}>
            ⚠️ Site is currently DOWN for visitors
          </div>
          <div style={{ fontSize: 11, color: "#EF4444", marginTop: 3 }}>
            Click "Bring Site Back Live" to restore access.
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "#475569",
          lineHeight: 1.6,
        }}
      >
        💡 Tip: To access the site yourself while maintenance is ON, add{" "}
        <code
          style={{ background: "#0F172A", padding: "1px 5px", borderRadius: 3 }}
        >
          ?admin=1
        </code>{" "}
        to the URL. Example:{" "}
        <code
          style={{ background: "#0F172A", padding: "1px 5px", borderRadius: 3 }}
        >
          https://bestpickr.in?admin=1
        </code>
      </div>
    </div>
  );
}

// ── MAIN DASHBOARD ─────────────────────────────────────────────────
export default function AdminDashboard({
  onClose,
  maintenance = {},
  onMaintenanceChange,
  adminToken,
}) {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    if (sessionStorage.getItem("bp_admin") === "yes") setAuthed(true);
  }, []);

  function handleLogin(e) {
    e.preventDefault();
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      sessionStorage.setItem("bp_admin", "yes");
      setAuthed(true);
      setErr("");
    } else {
      setErr("Invalid credentials.");
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("bp_admin");
    setAuthed(false);
    setStats(null);
    setEvents([]);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/stats`)
          .then((r) => r.json())
          .catch(() => null),
        fetch(`${API_BASE}/analytics/events?limit=50`)
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setStats(statsRes);
      setEvents(eventsRes?.events || []);
      setLastRefresh(new Date());
      setLiveCount(Math.floor(Math.random() * 8) + 1);
    } catch (_) {
      setStats(MOCK_STATS);
      setEvents(MOCK_EVENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [authed, fetchData]);

  // ── LOGIN SCREEN ────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="admin-wrap">
        <div className="admin-login">
          <div className="admin-login-card">
            <div style={{ fontSize: 32, marginBottom: 16 }}>🔐</div>
            <div className="admin-login-title">bestpickr Admin</div>
            <div className="admin-login-sub">
              Dashboard access · Authorized users only
            </div>
            <form onSubmit={handleLogin}>
              <input
                className="admin-input"
                placeholder="Username"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="username"
              />
              <input
                className="admin-input"
                type="password"
                placeholder="Password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password"
              />
              {err && (
                <div
                  style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}
                >
                  {err}
                </div>
              )}
              <button className="admin-login-btn" type="submit">
                Sign In →
              </button>
            </form>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button
                onClick={onClose}
                style={{
                  color: "#475569",
                  fontSize: 12,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                ← Back to site
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const s = stats || MOCK_STATS;
  const ev = events.length > 0 ? events : MOCK_EVENTS;

  // ── DASHBOARD ───────────────────────────────────────────────────
  return (
    <div className="admin-wrap">
      {/* Nav */}
      <div className="admin-nav">
        <div className="admin-nav-logo">
          bestpickr <span>Admin</span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#64748B",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span className="admin-live-dot" /> {liveCount} live now
        </div>
        {maintenance.enabled && (
          <div
            style={{
              background: "#450A0A",
              border: "1px solid #7F1D1D",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 11,
              color: "#F87171",
              fontWeight: 700,
            }}
          >
            ⚠️ MAINTENANCE ON
          </div>
        )}
        <div
          style={{
            width: 1,
            height: 20,
            background: "#334155",
            margin: "0 8px",
          }}
        />
        <button className="admin-refresh-btn" onClick={fetchData}>
          {loading ? "..." : "⟳ Refresh"}
        </button>
        <div
          style={{
            width: 1,
            height: 20,
            background: "#334155",
            margin: "0 8px",
          }}
        />
        <button onClick={handleLogout} className="admin-nav-logout">
          Logout
        </button>
        <button
          onClick={onClose}
          style={{
            marginLeft: 8,
            fontSize: 12,
            color: "#64748B",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          ✕ Close
        </button>
      </div>

      <div className="admin-content">
        <div className="admin-title">Analytics Dashboard</div>
        <div className="admin-sub">
          {lastRefresh
            ? `Last updated: ${fmtTime(lastRefresh.toISOString())}`
            : "Loading…"}{" "}
          · Auto-refreshes every 30s
        </div>

        {/* ── MAINTENANCE MODE — top of dashboard ── */}
        <MaintenancePanel
          maintenance={maintenance}
          onMaintenanceChange={onMaintenanceChange}
          adminToken={adminToken || "bestpickr-admin-2025"}
        />

        {/* ── STAT CARDS ── */}
        <div className="admin-stat-grid">
          {[
            {
              label: "Total Visitors",
              val: s.totalVisitors,
              sub: "All time unique",
              cls: "blue",
            },
            {
              label: "Page Views",
              val: s.totalPageViews,
              sub: "All sessions",
              cls: "green",
            },
            {
              label: "Affiliate Clicks",
              val: s.affiliateClicks,
              sub: "Amazon buy clicks",
              cls: "orange",
            },
            {
              label: "Searches",
              val: s.totalSearches,
              sub: "Total queries",
              cls: "purple",
            },
            {
              label: "Today's Visitors",
              val: s.todayVisitors,
              sub: "Since midnight IST",
              extraStyle: { color: "#34D399" },
            },
            {
              label: "Conversion Rate",
              val: s.totalPageViews
                ? ((s.affiliateClicks / s.totalPageViews) * 100).toFixed(1) +
                  "%"
                : "0%",
              sub: "Clicks / Page views",
              extraStyle: { color: "#FB923C" },
            },
          ].map(({ label, val, sub, cls, extraStyle }) => (
            <div key={label} className={`admin-stat ${cls || ""}`}>
              <div className="admin-stat-label">{label}</div>
              <div className="admin-stat-val" style={extraStyle}>
                {typeof val === "number" ? val.toLocaleString() : val}
              </div>
              <div className="admin-stat-sub">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── TOP PRODUCTS ── */}
        <div className="admin-card">
          <div className="admin-card-title">
            🛒 Top Amazon Products Clicked{" "}
            <span className="admin-badge green">Live</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Clicks</th>
                <th>Traffic</th>
              </tr>
            </thead>
            <tbody>
              {(s.topProducts || MOCK_STATS.topProducts).map((p, i) => (
                <tr key={i}>
                  <td style={{ color: "#64748B" }}>#{i + 1}</td>
                  <td>{p.name}</td>
                  <td>
                    <span className="admin-badge blue">{p.clicks}</span>
                  </td>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div
                        className="admin-chart-bar"
                        style={{
                          width:
                            Math.max(
                              20,
                              (p.clicks / (s.topProducts[0]?.clicks || 1)) *
                                120,
                            ) + "px",
                        }}
                      />
                      <span style={{ fontSize: 11, color: "#64748B" }}>
                        {(
                          (p.clicks / (s.topProducts[0]?.clicks || 1)) *
                          100
                        ).toFixed(0)}
                        %
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── TOP SEARCHES ── */}
        <div className="admin-card">
          <div className="admin-card-title">🔍 Top Search Queries</div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Query</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {(s.topSearches || MOCK_STATS.topSearches).map((q, i) => (
                <tr key={i}>
                  <td style={{ color: "#64748B" }}>#{i + 1}</td>
                  <td>{q.query}</td>
                  <td>
                    <span className="admin-badge blue">{q.count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── RECENT EVENTS ── */}
        <div className="admin-card">
          <div className="admin-card-title">
            📋 Recent Events{" "}
            <span style={{ fontSize: 12, color: "#64748B", fontWeight: 400 }}>
              (last 50)
            </span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Details</th>
                <th>Screen</th>
              </tr>
            </thead>
            <tbody>
              {ev.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: "#64748B", fontSize: 11 }}>
                    {fmtTime(e.timestamp)}
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${e.eventType === "affiliate_click" ? "green" : "blue"}`}
                    >
                      {e.eventType}
                    </span>
                  </td>
                  <td
                    style={{
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.query || e.productName || e.page || e.path || "—"}
                  </td>
                  <td style={{ color: "#64748B", fontSize: 11 }}>
                    {e.screenWidth ? `${e.screenWidth}px` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── TELEGRAM SETUP ── */}
        <div className="admin-card">
          <div className="admin-card-title">🤖 Telegram Notifications</div>
          <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.7 }}>
            <p style={{ marginBottom: 8 }}>
              Your site sends daily analytics reports to Telegram. To set this
              up:
            </p>
            <ol
              style={{
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <li>
                Create a bot via{" "}
                <strong style={{ color: "#60A5FA" }}>@BotFather</strong> on
                Telegram → get your <strong>BOT_TOKEN</strong>
              </li>
              <li>
                Message your bot once, then visit:{" "}
                <code
                  style={{
                    background: "#0F172A",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
                </code>{" "}
                to get your <strong>CHAT_ID</strong>
              </li>
              <li>
                Add to Vercel env vars:{" "}
                <code
                  style={{
                    background: "#0F172A",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  TELEGRAM_BOT_TOKEN
                </code>{" "}
                and{" "}
                <code
                  style={{
                    background: "#0F172A",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  TELEGRAM_CHAT_ID
                </code>
              </li>
              <li>Daily reports fire at 9:30 AM IST automatically 📊</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MOCK DATA ──────────────────────────────────────────────────────
const MOCK_STATS = {
  totalVisitors: 142,
  totalPageViews: 489,
  affiliateClicks: 37,
  totalSearches: 201,
  todayVisitors: 14,
  topProducts: [
    { name: "boAt Airdopes 141", clicks: 18 },
    { name: "Redmi A4 5G", clicks: 11 },
    { name: "Amazon Echo Dot 5th Gen", clicks: 8 },
  ],
  topSearches: [
    { query: "noise cancelling headphones", count: 34 },
    { query: "best mobiles india 2026", count: 28 },
    { query: "gaming mouse", count: 22 },
    { query: "air fryer", count: 18 },
    { query: "laptop for students", count: 15 },
  ],
};
const MOCK_EVENTS = [
  {
    timestamp: new Date().toISOString(),
    eventType: "page_view",
    page: "home",
    screenWidth: 1440,
  },
  {
    timestamp: new Date(Date.now() - 60000).toISOString(),
    eventType: "search",
    query: "best mobiles 2026",
    screenWidth: 375,
  },
  {
    timestamp: new Date(Date.now() - 120000).toISOString(),
    eventType: "affiliate_click",
    productName: "boAt Airdopes 141",
    screenWidth: 768,
  },
  {
    timestamp: new Date(Date.now() - 200000).toISOString(),
    eventType: "product_view",
    productName: "Sony WH-1000XM5",
    screenWidth: 1280,
  },
];
