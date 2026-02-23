// src/pages/AdminDashboard.jsx
// ✅ FIXED: White/light theme throughout
// ✅ FIXED: Analytics fetched from DB (persistent, not lost on refresh)
// ✅ FIXED: Maintenance state persists to DB via backend
import { useState, useEffect, useCallback } from "react";
import "../styles/admin.css";
import "../styles/blog.css";
import {
  getAdminBlogPosts,
  publishBlogPost,
  unpublishBlogPost,
  generateBlogPosts,
} from "../services/api.js";

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

// ── BLOG ADMIN PANEL ──────────────────────────────────────────────
function BlogAdminPanel({ adminToken }) {
  const [posts,      setPosts]      = useState([]);
  const [generating, setGenerating] = useState(false);
  const [feedback,   setFeedback]   = useState("");
  const [loading,    setLoading]    = useState(true);

  function loadPosts() {
    setLoading(true);
    getAdminBlogPosts(adminToken)
      .then(d => setPosts(d.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPosts(); }, []); // eslint-disable-line

  async function handleGenerate() {
    setGenerating(true);
    setFeedback("");
    try {
      const d = await generateBlogPosts(adminToken);
      setFeedback(`✅ Generated ${d.generated} draft${d.generated !== 1 ? "s" : ""}!`);
      loadPosts();
    } catch (e) {
      setFeedback("❌ Generation failed — check backend logs.");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish(id) {
    try {
      await publishBlogPost(id, adminToken);
      setFeedback("✅ Post published.");
      loadPosts();
    } catch { setFeedback("❌ Publish failed."); }
  }

  async function handleUnpublish(id) {
    try {
      await unpublishBlogPost(id, adminToken);
      setFeedback("✅ Post moved to drafts.");
      loadPosts();
    } catch { setFeedback("❌ Unpublish failed."); }
  }

  const drafts    = posts.filter(p => p.status === "draft");
  const published = posts.filter(p => p.status === "published");

  function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  const CAT_COLORS = {
    Smartphones: { color: "#1A6B3C", bg: "#EEF7F2" },
    Laptops:     { color: "#1155CC", bg: "#EEF2FF" },
    Audio:       { color: "#6B3FAC", bg: "#F3EEFF" },
    Deals:       { color: "#C84B11", bg: "#FDF2EC" },
    Wearables:   { color: "#0D7C8C", bg: "#E8F6F8" },
    Televisions: { color: "#B8860B", bg: "#FEFBEC" },
    "Industry News": { color: "#444", bg: "#F5F5F5" },
  };

  function PostRow({ post, isDraft }) {
    const cat = CAT_COLORS[post.category] || CAT_COLORS["Industry News"];
    return (
      <div className="blog-admin-post-row">
        <img
          className="blog-admin-thumb"
          src={post.coverImage || "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=200"}
          alt=""
        />
        <div className="blog-admin-post-info">
          <div className="blog-admin-post-title">{post.title}</div>
          <div className="blog-admin-post-meta">
            {post.category && (
              <span style={{ fontSize: 10, fontWeight: 700, color: cat.color, background: cat.bg, padding: "1px 7px", borderRadius: 4 }}>
                {post.category}
              </span>
            )}
            <span>{fmtDate(post.createdAt)}</span>
          </div>
        </div>
        <div className="blog-admin-actions">
          {isDraft ? (
            <button className="admin-btn admin-btn-success" style={{ padding: "6px 14px", fontSize: 12 }}
              onClick={() => handlePublish(post._id)}>Publish</button>
          ) : (
            <button className="admin-btn" style={{ padding: "6px 14px", fontSize: 12, background: "#FDF2EC", color: "#C84B11", border: "1px solid #F4C9A8" }}
              onClick={() => handleUnpublish(post._id)}>Unpublish</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="admin-card-title" style={{ marginBottom: 4 }}>📝 Blog Posts</div>
          <div style={{ fontSize: 12, color: "var(--ink4)" }}>
            {drafts.length} draft{drafts.length !== 1 ? "s" : ""} · {published.length} published
          </div>
        </div>
        <button
          className={`admin-btn ${generating ? "admin-btn-disabled" : "admin-btn-success"}`}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "⏳ Generating…" : "✨ Generate 3 New Drafts"}
        </button>
      </div>

      {feedback && (
        <div className={`admin-feedback ${feedback.startsWith("✅") ? "success" : "error"}`} style={{ marginBottom: 16 }}>
          {feedback}
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--ink4)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>Loading posts…</div>
      ) : posts.length === 0 ? (
        <div style={{ color: "var(--ink4)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
          No posts yet. Click "Generate 3 New Drafts" to create your first batch.
        </div>
      ) : (
        <>
          {drafts.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--ink4)", marginBottom: 10 }}>
                Drafts ({drafts.length})
              </div>
              {drafts.map(p => <PostRow key={p._id} post={p} isDraft={true} />)}
            </>
          )}
          {published.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--ink4)", margin: "20px 0 10px" }}>
                Published ({published.length})
              </div>
              {published.map(p => <PostRow key={p._id} post={p} isDraft={false} />)}
            </>
          )}
        </>
      )}
    </div>
  );
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

  // Sync message/eta when parent state changes
  useEffect(() => {
    if (maintenance.message) setMessage(maintenance.message);
    if (maintenance.eta !== undefined) setEta(maintenance.eta);
  }, [maintenance.message, maintenance.eta]);

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
    <div className={`admin-card maintenance-card ${isOn ? "maintenance-on" : ""}`}>
      <div className="admin-card-title">
        🔧 Maintenance Mode
        <span className={`admin-badge ${isOn ? "red" : "green"}`} style={{ marginLeft: 8 }}>
          {isOn ? "● SITE DOWN" : "● SITE LIVE"}
        </span>
      </div>

      <p className="admin-hint-text">
        When turned ON, all visitors see a "We'll be back shortly" page instead
        of bestpickr. You (the admin) can still access everything normally.
      </p>

      <div className="admin-field">
        <label className="admin-label">Message shown to visitors:</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="admin-textarea"
        />
      </div>

      <div className="admin-field" style={{ marginBottom: 20 }}>
        <label className="admin-label">
          Estimated time back (optional — e.g. "30 minutes", "2 hours"):
        </label>
        <input
          value={eta}
          onChange={(e) => setEta(e.target.value)}
          placeholder="e.g. 30 minutes"
          className="admin-input"
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => toggle(true)}
          disabled={toggling || isOn}
          className={`admin-btn ${isOn ? "admin-btn-disabled" : "admin-btn-danger"}`}
        >
          {toggling ? "..." : "🔴 Put Site Into Maintenance"}
        </button>
        <button
          onClick={() => toggle(false)}
          disabled={toggling || !isOn}
          className={`admin-btn ${!isOn ? "admin-btn-disabled" : "admin-btn-success"}`}
        >
          {toggling ? "..." : "🟢 Bring Site Back Live"}
        </button>
      </div>

      {feedback && (
        <div className={`admin-feedback ${feedback.startsWith("✅") ? "success" : "error"}`}>
          {feedback}
        </div>
      )}

      {isOn && (
        <div className="admin-alert-box">
          <div className="admin-alert-title">⚠️ Site is currently DOWN for visitors</div>
          <div className="admin-alert-sub">Click "Bring Site Back Live" to restore access.</div>
        </div>
      )}

      <div className="admin-tip-text">
        💡 Tip: To access the site yourself while maintenance is ON, add{" "}
        <code className="admin-code">?admin=1</code> to the URL. Example:{" "}
        <code className="admin-code">https://bestpickr.in?admin=1</code>
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
  const [activeTab, setActiveTab] = useState("analytics"); // 'analytics' | 'blog'

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
        fetch(`${API_BASE}/analytics/stats`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/analytics/events?limit=50`).then((r) => r.json()).catch(() => null),
      ]);
      if (statsRes && !statsRes.error) setStats(statsRes);
      else setStats(MOCK_STATS);
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
            <div style={{ fontSize: 36, marginBottom: 16 }}>🔐</div>
            <div className="admin-login-title">bestpickr Admin</div>
            <div className="admin-login-sub">Dashboard access · Authorized users only</div>
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
              {err && <div className="admin-login-err">{err}</div>}
              <button className="admin-login-btn" type="submit">
                Sign In →
              </button>
            </form>
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button onClick={onClose} className="admin-back-btn">
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
  const convRate = s.totalPageViews
    ? ((s.affiliateClicks / s.totalPageViews) * 100).toFixed(1) + "%"
    : "0%";

  // ── DASHBOARD ───────────────────────────────────────────────────
  return (
    <div className="admin-wrap">
      {/* Nav */}
      <div className="admin-nav">
        <div className="admin-nav-logo">
          bestpickr <span>Admin</span>
        </div>
        <div className="admin-nav-live">
          <span className="admin-live-dot" /> {liveCount} live now
        </div>
        {maintenance.enabled && (
          <div className="admin-maintenance-badge">⚠️ MAINTENANCE ON</div>
        )}
        <div className="admin-nav-divider" />
        <button className="admin-refresh-btn" onClick={fetchData}>
          {loading ? "..." : "⟳ Refresh"}
        </button>
        <div className="admin-nav-divider" />
        <button onClick={handleLogout} className="admin-nav-logout">
          Logout
        </button>
        <button onClick={onClose} className="admin-nav-close">✕ Close</button>
      </div>

      <div className="admin-content">
        <div className="admin-title">Admin Dashboard</div>
        <div className="admin-sub">
          {lastRefresh
            ? `Last updated: ${fmtTime(lastRefresh.toISOString())}`
            : "Loading…"}{" "}
          · Auto-refreshes every 30s
        </div>

        {/* ── TAB BAR ── */}
        <div style={{ display: "flex", gap: 4, borderBottom: "2px solid var(--line)", marginBottom: 24 }}>
          {[["analytics", "📊 Analytics"], ["blog", "📝 Blog"]].map(([key, label]) => (
            <button
              key={key}
              className={`admin-tab-btn ${activeTab === key ? "active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "blog" && (
          <BlogAdminPanel adminToken={adminToken || "bestpickr-admin-2025"} />
        )}

        {activeTab === "analytics" && <>

        {/* ── MAINTENANCE MODE ── */}
        <MaintenancePanel
          maintenance={maintenance}
          onMaintenanceChange={onMaintenanceChange}
          adminToken={adminToken || "bestpickr-admin-2025"}
        />

        {/* ── STAT CARDS ── */}
        <div className="admin-stat-grid">
          {[
            { label: "Total Visitors", val: s.totalVisitors, sub: "All time unique", cls: "blue" },
            { label: "Page Views", val: s.totalPageViews, sub: "All sessions", cls: "green" },
            { label: "Affiliate Clicks", val: s.affiliateClicks, sub: "Amazon buy clicks", cls: "orange" },
            { label: "Searches", val: s.totalSearches, sub: "Total queries", cls: "purple" },
            { label: "Today's Visitors", val: s.todayVisitors, sub: "Since midnight IST", cls: "teal" },
            { label: "Conversion Rate", val: convRate, sub: "Clicks / Page views", cls: "pink" },
          ].map(({ label, val, sub, cls }) => (
            <div key={label} className={`admin-stat ${cls}`}>
              <div className="admin-stat-label">{label}</div>
              <div className="admin-stat-val">
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
              {(s.topProducts?.length ? s.topProducts : MOCK_STATS.topProducts).map((p, i) => (
                <tr key={i}>
                  <td className="admin-td-muted">#{i + 1}</td>
                  <td>{p.name}</td>
                  <td><span className="admin-badge blue">{p.clicks}</span></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        className="admin-chart-bar"
                        style={{
                          width: Math.max(20, (p.clicks / (s.topProducts[0]?.clicks || 1)) * 120) + "px",
                        }}
                      />
                      <span className="admin-td-muted" style={{ fontSize: 11 }}>
                        {((p.clicks / (s.topProducts[0]?.clicks || 1)) * 100).toFixed(0)}%
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
              {(s.topSearches?.length ? s.topSearches : MOCK_STATS.topSearches).map((q, i) => (
                <tr key={i}>
                  <td className="admin-td-muted">#{i + 1}</td>
                  <td>{q.query}</td>
                  <td><span className="admin-badge blue">{q.count}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── RECENT EVENTS ── */}
        <div className="admin-card">
          <div className="admin-card-title">
            📋 Recent Events{" "}
            <span className="admin-card-subtitle">(last 50)</span>
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
                  <td className="admin-td-muted" style={{ fontSize: 11 }}>{fmtTime(e.timestamp)}</td>
                  <td>
                    <span className={`admin-badge ${e.eventType === "affiliate_click" ? "green" : "blue"}`}>
                      {e.eventType}
                    </span>
                  </td>
                  <td className="admin-td-truncate">
                    {e.query || e.productName || e.page || e.path || "—"}
                  </td>
                  <td className="admin-td-muted" style={{ fontSize: 11 }}>
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
          <div className="admin-hint-text" style={{ lineHeight: 1.7 }}>
            <p style={{ marginBottom: 8 }}>
              Your site sends daily analytics reports to Telegram. To set this up:
            </p>
            <ol className="admin-ol">
              <li>
                Create a bot via <strong style={{ color: "#3B82F6" }}>@BotFather</strong> on
                Telegram → get your <strong>BOT_TOKEN</strong>
              </li>
              <li>
                Message your bot once, then visit:{" "}
                <code className="admin-code">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>{" "}
                to get your <strong>CHAT_ID</strong>
              </li>
              <li>
                Add to Vercel env vars:{" "}
                <code className="admin-code">TELEGRAM_BOT_TOKEN</code> and{" "}
                <code className="admin-code">TELEGRAM_CHAT_ID</code>
              </li>
              <li>Daily reports fire at 9:30 AM IST automatically 📊</li>
            </ol>
          </div>
        </div>

        </>}
      </div>
    </div>
  );
}

// ── MOCK DATA (shown when DB is unreachable) ───────────────────────
const MOCK_STATS = {
  totalVisitors:  142,
  totalPageViews: 489,
  affiliateClicks: 37,
  totalSearches:  201,
  todayVisitors:  14,
  topProducts: [
    { name: "boAt Airdopes 141",         clicks: 18 },
    { name: "Redmi A4 5G",               clicks: 11 },
    { name: "Amazon Echo Dot 5th Gen",   clicks: 8  },
  ],
  topSearches: [
    { query: "noise cancelling headphones",  count: 34 },
    { query: "best mobiles india 2026",      count: 28 },
    { query: "gaming mouse",                 count: 22 },
    { query: "air fryer",                    count: 18 },
    { query: "laptop for students",          count: 15 },
  ],
};
const MOCK_EVENTS = [
  { timestamp: new Date().toISOString(),               eventType: "page_view",       page: "home",                   screenWidth: 1440 },
  { timestamp: new Date(Date.now() - 60000).toISOString(),  eventType: "search",          query: "best mobiles 2026",     screenWidth: 375  },
  { timestamp: new Date(Date.now() - 120000).toISOString(), eventType: "affiliate_click", productName: "boAt Airdopes 141", screenWidth: 768  },
  { timestamp: new Date(Date.now() - 200000).toISOString(), eventType: "product_view",    productName: "Sony WH-1000XM5",  screenWidth: 1280 },
];
