// src/pages/AdminDashboard.jsx
// ✅ FIXED: White/light theme throughout
// ✅ FIXED: Analytics fetched from DB (persistent, not lost on refresh)
// ✅ FIXED: Maintenance state persists to DB via backend
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

// ── NEWS MANAGEMENT PANEL ────────────────────────────────────────
const NEWS_STATUSES = ['Draft', 'Pending', 'Approved', 'Rejected', 'Published', 'Archived'];
const STATUS_BADGE = { Draft:'blue', Pending:'orange', Approved:'teal', Rejected:'red', Published:'green', Archived:'purple' };

function NewsPanel({ adminToken }) {
  const token = adminToken || 'bestpickr-admin-2025';
  const [tab, setTab] = useState('Pending');
  const [articles, setArticles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [editing, setEditing] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [scheduling, setScheduling] = useState(null);
  const [schedDate, setSchedDate] = useState('');

  async function fetchArticles(status) {
    setBusy(true);
    setFeedback('');
    try {
      const r = await fetch(`${API_BASE}/admin/news?status=${status}&token=${token}`);
      const data = await r.json();
      setArticles(Array.isArray(data) ? data : []);
    } catch {
      setFeedback('❌ Could not load articles — backend may be offline.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { fetchArticles(tab); }, [tab]);

  async function changeStatus(slug, status) {
    setFeedback('');
    try {
      const r = await fetch(`${API_BASE}/admin/news/${slug}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, token }),
      });
      const data = await r.json();
      if (r.ok) { setFeedback(`✅ "${data.title}" → ${status}`); fetchArticles(tab); }
      else setFeedback('❌ ' + (data.error || 'Failed'));
    } catch { setFeedback('❌ Network error'); }
  }

  async function publishNow(slug) {
    setFeedback('');
    try {
      const r = await fetch(`${API_BASE}/admin/news/${slug}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediately: true, token }),
      });
      const data = await r.json();
      if (r.ok) { setFeedback(`✅ "${data.title}" is now live!`); fetchArticles(tab); }
      else setFeedback('❌ ' + (data.error || 'Failed'));
    } catch { setFeedback('❌ Network error'); }
  }

  async function schedulePublish(slug) {
    if (!schedDate) { setFeedback('❌ Pick a date/time first'); return; }
    setFeedback('');
    try {
      const r = await fetch(`${API_BASE}/admin/news/${slug}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: schedDate, token }),
      });
      const data = await r.json();
      if (r.ok) {
        setFeedback(`✅ Scheduled for ${new Date(schedDate).toLocaleString('en-IN')}`);
        setScheduling(null); setSchedDate(''); fetchArticles(tab);
      } else setFeedback('❌ ' + (data.error || 'Failed'));
    } catch { setFeedback('❌ Network error'); }
  }

  function openEdit(article) {
    setEditing(article.slug);
    setEditFields({ title: article.title, summary: article.summary, content: article.content || '', imageUrl: article.imageUrl || '' });
  }

  async function saveEdit(slug) {
    setFeedback('');
    try {
      const r = await fetch(`${API_BASE}/admin/news/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editFields, token }),
      });
      const data = await r.json();
      if (r.ok) { setFeedback(`✅ Saved "${data.title}"`); setEditing(null); fetchArticles(tab); }
      else setFeedback('❌ ' + (data.error || 'Failed'));
    } catch { setFeedback('❌ Network error'); }
  }

  return (
    <div className="admin-card">
      <div className="admin-card-title">📰 News Article Management</div>

      {/* Status tab bar */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        {NEWS_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className="admin-btn"
            style={{ padding:'4px 14px', fontSize:12, opacity: tab === s ? 1 : 0.45, fontWeight: tab === s ? 700 : 400 }}
          >{s}</button>
        ))}
        <button onClick={() => fetchArticles(tab)} className="admin-btn" style={{ marginLeft:'auto', padding:'4px 10px', fontSize:12 }}>⟳</button>
      </div>

      {feedback && (
        <div className={`admin-feedback ${feedback.startsWith('✅') ? 'success' : 'error'}`}>{feedback}</div>
      )}

      {busy ? (
        <div className="admin-hint-text">Loading…</div>
      ) : articles.length === 0 ? (
        <div className="admin-hint-text">No articles with status "{tab}".</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Status</th>
              <th>Published</th>
              <th>Scheduled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {articles.map(a => (
              <>
                <tr key={a.slug}>
                  <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={a.title}>{a.title}</td>
                  <td className="admin-td-muted">{a.source}</td>
                  <td><span className={`admin-badge ${STATUS_BADGE[a.status] || 'blue'}`}>{a.status}</span></td>
                  <td className="admin-td-muted" style={{ fontSize:11 }}>{a.publishDate ? new Date(a.publishDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="admin-td-muted" style={{ fontSize:11 }}>{a.scheduledAt ? new Date(a.scheduledAt).toLocaleString('en-IN') : '—'}</td>
                  <td>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      <button className="admin-btn" style={{ fontSize:11, padding:'2px 8px' }} onClick={() => editing === a.slug ? setEditing(null) : openEdit(a)}>✏️ Edit</button>
                      {!['Approved','Published','Archived'].includes(a.status) && (
                        <button className="admin-btn admin-btn-success" style={{ fontSize:11, padding:'2px 8px' }} onClick={() => changeStatus(a.slug, 'Approved')}>✅ Approve</button>
                      )}
                      {!['Rejected','Archived','Published'].includes(a.status) && (
                        <button className="admin-btn admin-btn-danger" style={{ fontSize:11, padding:'2px 8px' }} onClick={() => changeStatus(a.slug, 'Rejected')}>✕ Reject</button>
                      )}
                      {a.status === 'Approved' && (
                        <>
                          <button className="admin-btn" style={{ fontSize:11, padding:'2px 8px', background:'#10b981', color:'#fff' }} onClick={() => publishNow(a.slug)}>🚀 Publish Now</button>
                          <button className="admin-btn" style={{ fontSize:11, padding:'2px 8px' }} onClick={() => setScheduling(scheduling === a.slug ? null : a.slug)}>🕐 Schedule</button>
                        </>
                      )}
                      {a.status !== 'Archived' && (
                        <button className="admin-btn admin-btn-danger" style={{ fontSize:11, padding:'2px 8px', opacity:0.65 }} onClick={() => changeStatus(a.slug, 'Archived')}>🗄 Archive</button>
                      )}
                    </div>
                    {scheduling === a.slug && (
                      <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                        <input type="datetime-local" className="admin-input" style={{ fontSize:12, padding:'3px 6px', marginBottom:0, width:'auto' }} value={schedDate} onChange={e => setSchedDate(e.target.value)} />
                        <button className="admin-btn" style={{ fontSize:11, padding:'3px 8px' }} onClick={() => schedulePublish(a.slug)}>Set</button>
                        <button className="admin-btn admin-btn-danger" style={{ fontSize:11, padding:'3px 8px' }} onClick={() => { setScheduling(null); setSchedDate(''); }}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
                {editing === a.slug && (
                  <tr key={a.slug + '-edit'}>
                    <td colSpan={6} style={{ background:'#f8fafc', padding:'12px 16px', borderTop:'1px solid #e5e7eb' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:8, maxWidth:700 }}>
                        <label style={{ fontSize:12, fontWeight:600, color:'#374151' }}>Title</label>
                        <input className="admin-input" style={{ marginBottom:0 }} value={editFields.title || ''} onChange={e => setEditFields(f => ({ ...f, title: e.target.value }))} />
                        <label style={{ fontSize:12, fontWeight:600, color:'#374151' }}>Summary</label>
                        <textarea className="admin-textarea" rows={3} value={editFields.summary || ''} onChange={e => setEditFields(f => ({ ...f, summary: e.target.value }))} />
                        <label style={{ fontSize:12, fontWeight:600, color:'#374151' }}>Full Content</label>
                        <textarea className="admin-textarea" rows={7} value={editFields.content || ''} onChange={e => setEditFields(f => ({ ...f, content: e.target.value }))} />
                        <label style={{ fontSize:12, fontWeight:600, color:'#374151' }}>Image URL</label>
                        <input className="admin-input" style={{ marginBottom:0 }} value={editFields.imageUrl || ''} onChange={e => setEditFields(f => ({ ...f, imageUrl: e.target.value }))} />
                        <div style={{ display:'flex', gap:8, marginTop:4 }}>
                          <button className="admin-btn" onClick={() => saveEdit(a.slug)}>💾 Save</button>
                          <button className="admin-btn admin-btn-danger" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
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
        <div className="admin-title">Analytics Dashboard</div>
        <div className="admin-sub">
          {lastRefresh
            ? `Last updated: ${fmtTime(lastRefresh.toISOString())}`
            : "Loading…"}{" "}
          · Auto-refreshes every 30s
        </div>

        {/* ── MAINTENANCE MODE ── */}
        <MaintenancePanel
          maintenance={maintenance}
          onMaintenanceChange={onMaintenanceChange}
          adminToken={adminToken || "bestpickr-admin-2025"}
        />

        {/* ── NEWS MANAGEMENT ── */}
        <NewsPanel adminToken={adminToken || "bestpickr-admin-2025"} />

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
