// src/pages/AdminDashboard.jsx
// Static admin dashboard — login with hardcoded credentials
// Protected by client-side auth (use proper auth for production)

import { useState, useEffect, useCallback } from "react";
import "../styles/admin.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
// ⚠️ CHANGE THESE CREDENTIALS before deploying!
const ADMIN_USER = "admin";
const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASSWORD || "admin123";

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
}

export default function AdminDashboard({ onClose }) {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [liveCount, setLiveCount] = useState(0);

  // Check session
  useEffect(() => {
    const s = sessionStorage.getItem("bp_admin");
    if (s === "yes") setAuthed(true);
  }, []);

  function handleLogin(e) {
    e.preventDefault();
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      sessionStorage.setItem("bp_admin", "yes");
      setAuthed(true);
      setErr("");
    } else {
      setErr("Invalid credentials. Try again.");
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

      // Simulate live users (random for demo)
      setLiveCount(Math.floor(Math.random() * 8) + 1);
    } catch (err) {
      // Use mock data if API not connected
      setStats(MOCK_STATS);
      setEvents(MOCK_EVENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      fetchData();
      const interval = setInterval(fetchData, 3000000); // refresh every 30s
      return () => clearInterval(interval);
    }
  }, [authed, fetchData]);

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
            <div
              style={{
                marginTop: 16,
                fontSize: 12,
                color: "#475569",
                textAlign: "center",
              }}
            >
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

        {/* Stat Cards */}
        <div className="admin-stat-grid">
          <div className="admin-stat blue">
            <div className="admin-stat-label">Total Visitors</div>
            <div className="admin-stat-val">
              {(s.totalVisitors || 0).toLocaleString()}
            </div>
            <div className="admin-stat-sub">All time unique</div>
          </div>
          <div className="admin-stat green">
            <div className="admin-stat-label">Page Views</div>
            <div className="admin-stat-val">
              {(s.totalPageViews || 0).toLocaleString()}
            </div>
            <div className="admin-stat-sub">All sessions</div>
          </div>
          <div className="admin-stat orange">
            <div className="admin-stat-label">Affiliate Clicks</div>
            <div className="admin-stat-val">
              {(s.affiliateClicks || 0).toLocaleString()}
            </div>
            <div className="admin-stat-sub">Amazon buy clicks</div>
          </div>
          <div className="admin-stat purple">
            <div className="admin-stat-label">Searches</div>
            <div className="admin-stat-val">
              {(s.totalSearches || 0).toLocaleString()}
            </div>
            <div className="admin-stat-sub">Total queries</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-label">Today's Visitors</div>
            <div className="admin-stat-val" style={{ color: "#34D399" }}>
              {(s.todayVisitors || 0).toLocaleString()}
            </div>
            <div className="admin-stat-sub">Since midnight IST</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-label">Conversion Rate</div>
            <div className="admin-stat-val" style={{ color: "#FB923C" }}>
              {s.totalPageViews
                ? ((s.affiliateClicks / s.totalPageViews) * 100).toFixed(1)
                : "0"}
              %
            </div>
            <div className="admin-stat-sub">Clicks / Page views</div>
          </div>
        </div>

        {/* Top Products Clicked */}
        <div className="admin-card">
          <div className="admin-card-title">
            🛒 Top Amazon Products Clicked
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

        {/* Top Searches */}
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

        {/* Recent Events */}
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

        {/* Telegram Setup Info */}
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
                Add to your Vercel env vars:{" "}
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
              <li>Daily reports fire at 9 AM IST automatically 📊</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MOCK DATA (shown when API not connected) ───────────────────────
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
    { query: "gaming mouse", count: 22 },
    { query: "air fryer", count: 18 },
    { query: "laptop for students", count: 15 },
    { query: "smartphone under 20000", count: 12 },
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
    query: "headphones",
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
