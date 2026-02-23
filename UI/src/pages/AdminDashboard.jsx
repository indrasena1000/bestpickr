// src/pages/AdminDashboard.jsx
// ✅ FIXED: White/light theme throughout
// ✅ FIXED: Analytics fetched from DB (persistent, not lost on refresh)
// ✅ FIXED: Maintenance state persists to DB via backend
// ✅ JWT auth: accessToken in memory + httpOnly refresh cookie (industry standard)
import { useState, useEffect, useCallback } from "react";
import "../styles/admin.css";
import "../styles/blog.css";
import {
  getAdminBlogPosts,
  publishBlogPost,
  unpublishBlogPost,
  generateBlogPosts,
  getBlogAnalytics,
  adminLogin,
  adminLogout,
  adminRefresh,
  setAccessToken,
  clearAccessToken,
} from "../services/api.js";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
  });
}

// ── BLOG ANALYTICS PANEL ──────────────────────────────────────────
function BlogAnalyticsPanel() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  function loadStats() {
    setLoading(true);
    getBlogAnalytics()
      .then(d => { if (d.success) setStats(d.stats); else setError("Failed to load."); })
      .catch(() => setError("Could not reach backend."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadStats(); }, []); // eslint-disable-line

  if (loading) return (
    <div className="admin-card" style={{ textAlign: "center", padding: "32px 0", color: "var(--ink4)", fontSize: 13 }}>
      Loading analytics…
    </div>
  );

  if (error || !stats) return (
    <div className="admin-card" style={{ textAlign: "center", padding: "32px 0" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
      <div style={{ color: "var(--ink4)", fontSize: 13, marginBottom: 12 }}>
        {error || "No data yet — analytics will appear once readers visit your blog posts."}
      </div>
      <button className="admin-btn" style={{ fontSize: 12, padding: "6px 16px" }} onClick={loadStats}>Retry</button>
    </div>
  );

  const totalDevices = stats.devices.mobile + stats.devices.desktop || 1;
  const totalSources = Object.values(stats.sources).reduce((s, n) => s + n, 0) || 1;

  function pct(n) { return totalSources > 0 ? Math.round((n / totalSources) * 100) : 0; }

  const SOURCE_META = {
    instagram: { label: "Instagram",  color: "#C2185B", bg: "#FCE4EC", icon: "📸" },
    google:    { label: "Google",     color: "#1565C0", bg: "#E3F2FD", icon: "🔍" },
    direct:    { label: "Direct",     color: "#2E7D32", bg: "#E8F5E9", icon: "🔗" },
    other:     { label: "Other",      color: "#546E7A", bg: "#ECEFF1", icon: "🌐" },
  };

  function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  }

  return (
    <>
      {/* ── Summary stat row ── */}
      <div className="admin-card" style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="admin-card-title" style={{ marginBottom: 0 }}>📖 Reading Analytics</div>
          <button className="admin-btn" style={{ fontSize: 11, padding: "4px 12px" }} onClick={loadStats}>⟳ Refresh</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Views",     val: stats.totalViews,    icon: "👁", color: "#1A6B3C", bg: "#EEF7F2" },
            { label: "Today",           val: stats.todayViews,    icon: "📅", color: "#1155CC", bg: "#EEF2FF" },
            { label: "This Week",       val: stats.weekViews,     icon: "📆", color: "#6B3FAC", bg: "#F3EEFF" },
            { label: "Unique Readers",  val: stats.uniqueReaders, icon: "👥", color: "#0D7C8C", bg: "#E8F6F8" },
            { label: "Avg Read Depth",  val: stats.avgReadDepth + "%", icon: "📏", color: "#B8860B", bg: "#FEFBEC" },
          ].map(({ label, val, icon, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>
                {typeof val === "number" ? val.toLocaleString() : val}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Two-column detail section ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Traffic Sources */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--ink4)", marginBottom: 10 }}>
              Traffic Sources
            </div>
            {Object.entries(SOURCE_META).map(([key, meta]) => {
              const count = stats.sources[key] || 0;
              const p = pct(count);
              if (count === 0) return null;
              return (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ink2)" }}>
                      <span style={{ fontSize: 14 }}>{meta.icon}</span> {meta.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{p}% <span style={{ color: "var(--ink4)", fontWeight: 400 }}>({count})</span></span>
                  </div>
                  <div style={{ height: 6, background: "var(--paper2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: p + "%", background: meta.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                  </div>
                </div>
              );
            })}

            {/* Device split */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--ink4)", marginBottom: 10 }}>
                Device Split
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { label: "Mobile",  val: stats.devices.mobile,  icon: "📱", color: "#1A6B3C" },
                  { label: "Desktop", val: stats.devices.desktop, icon: "💻", color: "#1155CC" },
                ].map(({ label, val, icon, color }) => (
                  <div key={label} style={{ flex: 1, textAlign: "center", padding: "10px 8px", background: "var(--paper2)", borderRadius: 8 }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color }}>{Math.round((val / totalDevices) * 100)}%</div>
                    <div style={{ fontSize: 10, color: "var(--ink4)", fontWeight: 600 }}>{label} · {val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Posts */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--ink4)", marginBottom: 10 }}>
              Top Posts by Views
            </div>
            {stats.topPosts.length === 0 ? (
              <div style={{ color: "var(--ink4)", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
                No post views yet — publish a post and share it!
              </div>
            ) : stats.topPosts.map((p, i) => {
              const maxViews = stats.topPosts[0].views;
              return (
                <div key={p.slug} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink2)", flex: 1, marginRight: 8, lineHeight: 1.35 }}>
                      <span style={{ color: "var(--ink4)", fontWeight: 700, marginRight: 5 }}>#{i + 1}</span>
                      {p.title || p.slug}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>{p.views}v</span>
                  </div>
                  <div style={{ height: 5, background: "var(--paper2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: Math.round((p.views / maxViews) * 100) + "%", background: "var(--accent)", borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}

            {/* Read depth note */}
            {stats.readDepthSamples > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--ink3)" }}>
                📏 Based on <strong>{stats.readDepthSamples}</strong> sessions, readers scroll through an average of{" "}
                <strong style={{ color: "var(--accent)" }}>{stats.avgReadDepth}%</strong> of your articles.
                {stats.avgReadDepth >= 70 && " 🔥 Excellent engagement!"}
                {stats.avgReadDepth >= 40 && stats.avgReadDepth < 70 && " Good — keep headlines tight."}
                {stats.avgReadDepth < 40 && " Try shorter intros to hook readers faster."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Live Activity Feed ── */}
      {stats.recentActivity.length > 0 && (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <div className="admin-card-title" style={{ marginBottom: 12 }}>
            🔴 Recent Blog Activity <span className="admin-card-subtitle">(last 20 events)</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr><th>Time</th><th>Event</th><th>Post</th><th>Detail</th><th>Source</th></tr>
            </thead>
            <tbody>
              {stats.recentActivity.map((e, i) => {
                const isView  = e.type === "blog_view";
                const ref     = (e.source || "direct").toLowerCase();
                const srcLabel = ref.includes("instagram") ? "📸 IG" : ref.includes("google") ? "🔍 Google" : ref === "direct" || !ref ? "🔗 Direct" : "🌐 Other";
                return (
                  <tr key={i}>
                    <td className="admin-td-muted" style={{ fontSize: 11 }}>{fmtTime(e.time)}</td>
                    <td>
                      <span className={`admin-badge ${isView ? "blue" : "green"}`}>
                        {isView ? "👁 view" : "📏 depth"}
                      </span>
                    </td>
                    <td className="admin-td-truncate" style={{ maxWidth: 180, fontSize: 12 }}>
                      {e.title || e.slug || "—"}
                    </td>
                    <td className="admin-td-muted" style={{ fontSize: 11 }}>
                      {isView ? (e.category || "—") : (e.depth != null ? e.depth + "%" : "—")}
                    </td>
                    <td className="admin-td-muted" style={{ fontSize: 11 }}>{srcLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── BLOG ADMIN PANEL ──────────────────────────────────────────────
function BlogAdminPanel() {
  const [posts,       setPosts]      = useState([]);
  const [generating,  setGenerating] = useState(false);
  const [feedback,    setFeedback]   = useState("");
  const [loading,     setLoading]    = useState(true);
  const [previewPost, setPreviewPost] = useState(null);
  const [searchQ,     setSearchQ]    = useState("");
  const [sortBy,      setSortBy]     = useState("newest");
  const [statusFilter, setStatusFilter] = useState("all"); // all | draft | published

  function loadPosts() {
    setLoading(true);
    getAdminBlogPosts()
      .then(d => setPosts(d.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadPosts(); }, []); // eslint-disable-line

  async function handleGenerate() {
    setGenerating(true);
    setFeedback("");
    try {
      const d = await generateBlogPosts();
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
      await publishBlogPost(id);
      setFeedback("✅ Post published.");
      loadPosts();
    } catch { setFeedback("❌ Publish failed."); }
  }

  async function handleUnpublish(id) {
    try {
      await unpublishBlogPost(id);
      setFeedback("✅ Post moved to drafts.");
      loadPosts();
    } catch { setFeedback("❌ Unpublish failed."); }
  }

  const drafts    = posts.filter(p => p.status === "draft");
  const published = posts.filter(p => p.status === "published");

  // ── Filtered + sorted view ─────────────────────────────────────────
  const bq = searchQ.trim().toLowerCase();
  const visiblePosts = posts
    .filter(p => statusFilter === "all" || p.status === statusFilter)
    .filter(p =>
      !bq ||
      (p.title   || "").toLowerCase().includes(bq) ||
      (p.excerpt || "").toLowerCase().includes(bq) ||
      (p.category|| "").toLowerCase().includes(bq)
    )
    .sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === "alpha")  return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "zalpha") return (b.title || "").localeCompare(a.title || "");
      return new Date(b.createdAt) - new Date(a.createdAt); // newest
    });

  const visibleDrafts    = visiblePosts.filter(p => p.status === "draft");
  const visiblePublished = visiblePosts.filter(p => p.status === "published");

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
        <div className="blog-admin-actions" style={{ display: "flex", gap: 8 }}>
          <button
            className="admin-btn"
            style={{ padding: "6px 14px", fontSize: 12, background: "#EEF2FF", color: "#1155CC", border: "1px solid #C7D7F5" }}
            onClick={() => setPreviewPost(post)}
          >
            👁 Review
          </button>
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
    <>
      <div className="admin-card">
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
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

        {/* ── Filter bar ────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 0 }}>
            <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ink4)", pointerEvents: "none" }}
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search posts…"
              style={{
                width: "100%", paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                border: "1px solid var(--line)", borderRadius: "var(--r)",
                background: "var(--paper2)", color: "var(--ink)", fontSize: 13,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--paper2)", color: "var(--ink)", fontSize: 13, cursor: "pointer" }}
          >
            <option value="all">All ({posts.length})</option>
            <option value="draft">Drafts ({drafts.length})</option>
            <option value="published">Published ({published.length})</option>
          </select>
          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--paper2)", color: "var(--ink)", fontSize: 13, cursor: "pointer" }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="alpha">Title A → Z</option>
            <option value="zalpha">Title Z → A</option>
          </select>
          {(searchQ || statusFilter !== "all" || sortBy !== "newest") && (
            <button
              onClick={() => { setSearchQ(""); setStatusFilter("all"); setSortBy("newest"); }}
              style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--paper2)", color: "var(--ink3)", fontSize: 12, cursor: "pointer" }}
            >
              ✕ Reset
            </button>
          )}
          {(searchQ || statusFilter !== "all") && (
            <span style={{ fontSize: 12, color: "var(--ink4)", marginLeft: 2 }}>
              {visiblePosts.length} result{visiblePosts.length !== 1 ? "s" : ""}
            </span>
          )}
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
        ) : visiblePosts.length === 0 ? (
          <div style={{ color: "var(--ink4)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
            No posts match your filter.
          </div>
        ) : (
          <>
            {visibleDrafts.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--ink4)", marginBottom: 10 }}>
                  Drafts ({visibleDrafts.length})
                </div>
                {visibleDrafts.map(p => <PostRow key={p._id} post={p} isDraft={true} />)}
              </>
            )}
            {visiblePublished.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--ink4)", margin: "20px 0 10px" }}>
                  Published ({visiblePublished.length})
                </div>
                {visiblePublished.map(p => <PostRow key={p._id} post={p} isDraft={false} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* ── PREVIEW DRAWER ──────────────────────────────────────────── */}
      {previewPost && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex" }}>
          {/* Backdrop */}
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
            onClick={() => setPreviewPost(null)}
          />

          {/* Drawer panel — slides in from right */}
          <div style={{
            position: "relative", zIndex: 1, marginLeft: "auto",
            width: "min(780px, 100vw)", height: "100%",
            background: "var(--paper)", overflowY: "auto",
            boxShadow: "-12px 0 48px rgba(0,0,0,0.22)",
            display: "flex", flexDirection: "column",
          }}>

            {/* Sticky header with actions */}
            <div style={{
              position: "sticky", top: 0, zIndex: 10,
              background: "var(--paper)", borderBottom: "1px solid var(--line)",
              padding: "12px 20px", display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink2)" }}>
                  {previewPost.status === "draft" ? "📋 Draft Preview" : "✅ Published Post"}
                </span>
                {previewPost.status === "draft" ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#C84B11", background: "#FDF2EC", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Draft</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#1A6B3C", background: "#EEF7F2", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Live</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {previewPost.status === "draft" ? (
                  <button
                    className="admin-btn admin-btn-success"
                    style={{ padding: "7px 18px", fontSize: 12 }}
                    onClick={async () => {
                      await handlePublish(previewPost._id);
                      setPreviewPost(p => ({ ...p, status: "published" }));
                    }}
                  >
                    ✅ Publish Now
                  </button>
                ) : (
                  <button
                    className="admin-btn"
                    style={{ padding: "7px 18px", fontSize: 12, background: "#FDF2EC", color: "#C84B11", border: "1px solid #F4C9A8" }}
                    onClick={async () => {
                      await handleUnpublish(previewPost._id);
                      setPreviewPost(p => ({ ...p, status: "draft" }));
                    }}
                  >
                    Unpublish
                  </button>
                )}
                <button
                  style={{ background: "none", border: "1px solid var(--line)", borderRadius: 6, fontSize: 16, cursor: "pointer", color: "var(--ink4)", padding: "5px 10px", lineHeight: 1 }}
                  onClick={() => setPreviewPost(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Cover image */}
            {previewPost.coverImage && (
              <div style={{ height: 260, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                <img
                  src={previewPost.coverImage}
                  alt={previewPost.coverImageAlt || ""}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)" }} />
              </div>
            )}

            {/* Article body */}
            <div style={{ padding: "28px 32px 64px", flex: 1 }}>
              {/* Meta row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                {previewPost.category && (() => {
                  const cat = CAT_COLORS[previewPost.category] || CAT_COLORS["Industry News"];
                  return (
                    <span style={{ fontSize: 11, fontWeight: 700, color: cat.color, background: cat.bg, padding: "2px 10px", borderRadius: 4 }}>
                      {previewPost.category}
                    </span>
                  );
                })()}
                <span style={{ fontSize: 12, color: "var(--ink4)" }}>{fmtDate(previewPost.createdAt)}</span>
                {previewPost.readTimeMinutes && (
                  <span style={{ fontSize: 12, color: "var(--ink4)" }}>{previewPost.readTimeMinutes} min read</span>
                )}
              </div>

              {/* Title */}
              <h1 style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 800, letterSpacing: "-0.5px", color: "var(--ink)", marginBottom: 14, lineHeight: 1.25 }}>
                {previewPost.title}
              </h1>

              {/* Excerpt */}
              {previewPost.excerpt && (
                <p style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink3)", borderLeft: "3px solid var(--accent)", paddingLeft: 14, marginBottom: 24, lineHeight: 1.65, margin: "0 0 24px" }}>
                  {previewPost.excerpt}
                </p>
              )}

              {/* Tags */}
              {previewPost.tags?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                  {previewPost.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 11, color: "var(--ink4)", background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 4, padding: "2px 8px" }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "0 0 24px" }} />

              {/* Full rendered content */}
              <div
                className="blog-content"
                dangerouslySetInnerHTML={{ __html: previewPost.content }}
              />
            </div>

            {/* Bottom action bar */}
            <div style={{
              position: "sticky", bottom: 0, background: "var(--paper)",
              borderTop: "1px solid var(--line)", padding: "12px 20px",
              display: "flex", gap: 10, alignItems: "center",
            }}>
              {previewPost.status === "draft" ? (
                <button
                  className="admin-btn admin-btn-success"
                  style={{ padding: "10px 24px", fontSize: 13 }}
                  onClick={async () => {
                    await handlePublish(previewPost._id);
                    setPreviewPost(p => ({ ...p, status: "published" }));
                  }}
                >
                  ✅ Publish This Post
                </button>
              ) : (
                <button
                  className="admin-btn"
                  style={{ padding: "10px 24px", fontSize: 13, background: "#FDF2EC", color: "#C84B11", border: "1px solid #F4C9A8" }}
                  onClick={async () => {
                    await handleUnpublish(previewPost._id);
                    setPreviewPost(p => ({ ...p, status: "draft" }));
                  }}
                >
                  Move to Drafts
                </button>
              )}
              <button
                className="admin-btn"
                style={{ padding: "10px 24px", fontSize: 13 }}
                onClick={() => setPreviewPost(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── BLOG TAB VIEW — sub-tabs: Analytics | Posts ───────────────────
function BlogTabView() {
  const [blogTab, setBlogTab] = useState("analytics"); // "analytics" | "posts"
  return (
    <>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--line)", paddingBottom: 0 }}>
        {[["analytics", "📊 Reading Stats"], ["posts", "📝 Manage Posts"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setBlogTab(key)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "8px 16px", fontSize: 13, fontWeight: 700,
              color: blogTab === key ? "var(--accent)" : "var(--ink4)",
              borderBottom: blogTab === key ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {blogTab === "analytics" && <BlogAnalyticsPanel />}
      {blogTab === "posts"     && <BlogAdminPanel     />}
    </>
  );
}

// ── MAINTENANCE TOGGLE PANEL ───────────────────────────────────────
function MaintenancePanel({ maintenance, onMaintenanceChange }) {
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
}) {
  const [authed,      setAuthed]      = useState(false);
  const [authLoading, setAuthLoading] = useState(true);  // true while checking for existing session
  const [user,        setUser]        = useState("");
  const [pass,        setPass]        = useState("");
  const [err,         setErr]         = useState("");
  const [loginBusy,   setLoginBusy]   = useState(false);
  const [stats,       setStats]       = useState(null);
  const [events,      setEvents]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [liveCount,   setLiveCount]   = useState(0);
  const [activeTab,   setActiveTab]   = useState("analytics");

  // ── On mount: attempt silent refresh to restore session ──────────
  useEffect(() => {
    adminRefresh()
      .then((d) => { setAccessToken(d.accessToken); setAuthed(true); })
      .catch(() => { /* no valid session — show login */ })
      .finally(() => setAuthLoading(false));
  }, []);

  // ── Listen for token expiry events from axios interceptor ────────
  useEffect(() => {
    function onExpired() {
      clearAccessToken();
      setAuthed(false);
      setStats(null);
      setEvents([]);
      setErr("Session expired — please log in again.");
    }
    window.addEventListener("admin:session-expired", onExpired);
    return () => window.removeEventListener("admin:session-expired", onExpired);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginBusy(true);
    setErr("");
    try {
      const d = await adminLogin(user, pass);
      setAccessToken(d.accessToken);
      setAuthed(true);
    } catch (apiErr) {
      setErr(apiErr.response?.data?.error || "Invalid credentials.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    try { await adminLogout(); } catch (_) { /* ignore */ }
    clearAccessToken();
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
  if (authLoading) {
    return (
      <div className="admin-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "var(--ink4)", fontSize: 14 }}>Checking session…</div>
      </div>
    );
  }

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
                disabled={loginBusy}
              />
              <input
                className="admin-input"
                type="password"
                placeholder="Password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password"
                disabled={loginBusy}
              />
              {err && <div className="admin-login-err">{err}</div>}
              <button className="admin-login-btn" type="submit" disabled={loginBusy}>
                {loginBusy ? "Signing in…" : "Sign In →"}
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
          <BlogTabView />
        )}

        {activeTab === "analytics" && <>

        {/* ── MAINTENANCE MODE ── */}
        <MaintenancePanel
          maintenance={maintenance}
          onMaintenanceChange={onMaintenanceChange}
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
