// src/App.jsx
// ─────────────────────────────────────────────────────────────────
// ROUTING STRATEGY:
//   Hash routes (#/results?q=...) for internal navigation
//   Path routes (/best-mobiles-india-2026) for SEO landing pages
//
// SEO AUTO-SEARCH:
//   When Google sends a visitor to bestpickr.in/best-mobiles-india-2026,
//   this app reads the path, matches it to seoRoutes.js, and
//   automatically fires the mapped search query — showing real
//   Amazon + Flipkart results for exactly what the visitor searched.
//
// MAINTENANCE MODE:
//   Admin toggles from dashboard → backend stores state →
//   frontend polls /api/admin/status every 60 seconds.
// ─────────────────────────────────────────────────────────────────
import { useState, useCallback, useEffect, useRef } from "react";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import HomePage from "./pages/HomePage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";
import DetailPage from "./pages/DetailPage.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import MaintenancePage from "./pages/MaintenancePage.jsx";
import {
  AboutPage,
  HowItWorksPage,
  AIScorePage,
  PriceAlertsPage,
  PrivacyPage,
  TermsPage,
} from "./pages/StaticPage.jsx";
import AffiliateDisclosurePage from "./components/AffiliateDisclosurePage.jsx";
import BlogPage from "./pages/BlogPage.jsx";
import BlogPostPage from "./pages/BlogPostPage.jsx";
import { matchSeoRoute } from "./seoRoutes.js";
import { trackPageView, trackSearch } from "./utils/analytics.js";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// ── MAINTENANCE BLOG NAV ───────────────────────────────────────────
// Shown instead of the main Navbar when maintenance is ON but user is
// reading the blog. Keeps the experience dark + on-brand, with a clear
// "← Launch page" escape hatch. No product search exposed.
function MaintenanceBlogNav({ onBack }) {
  return (
    <nav
      style={{
        background: "#080e0a",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        className="wrap"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: "#1A6B3C",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
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
              fontSize: 18,
              letterSpacing: "-0.5px",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#5dba85" }}>best</span>
            <span style={{ color: "white" }}>pickr</span>
            <span style={{ color: "#F4956B", fontSize: 22 }}>.</span>
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              marginLeft: 4,
            }}
          >
            blog
          </span>
        </div>
        {/* Escape back to launch page */}
        <button
          onClick={onBack}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 100,
            padding: "6px 16px",
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          ← Launch page
        </button>
      </div>
    </nav>
  );
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ── SESSION STORAGE ────────────────────────────────────────────────
function saveDetailToSession(product, results) {
  try {
    sessionStorage.setItem("bp_detail_product", JSON.stringify(product));
    sessionStorage.setItem("bp_detail_results", JSON.stringify(results || []));
  } catch (_) {}
}
function loadDetailFromSession() {
  try {
    const p = sessionStorage.getItem("bp_detail_product");
    const r = sessionStorage.getItem("bp_detail_results");
    return {
      product: p ? JSON.parse(p) : null,
      results: r ? JSON.parse(r) : [],
    };
  } catch (_) {
    return { product: null, results: [] };
  }
}

// ── HASH ROUTER ────────────────────────────────────────────────────
function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "/";
  const [path, qs] = raw.split("?");
  const params = {};
  if (qs)
    qs.split("&").forEach((p) => {
      const [k, v] = p.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
  return { path: path || "/", params };
}
function setHash(path, params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  window.location.hash = "/" + path + (qs ? "?" + qs : "");
}

const PAGE_TITLES = {
  "/": "bestpickr — Best Rated Products in India | AI Comparison",
  results: "Search Results — bestpickr",
  about: "About bestpickr — AI Product Comparison India",
  blog: "bestpickr blog — Expert Tech Insights for Indian Buyers",
  "how-it-works": "How It Works — bestpickr AI Rankings",
  "ai-score": "AI Score Explained — bestpickr",
  "price-alerts": "Price Alerts — bestpickr",
  privacy: "Privacy Policy — bestpickr",
  terms: "Terms of Service — bestpickr",
  404: "Page Not Found — bestpickr",
};

export default function App() {
  // Check if visitor arrived via an SEO landing page URL
  const pathname = window.location.pathname.replace(/^\//, "");
  const seoMatch = matchSeoRoute(pathname);

  // Path-based blog routing: /blog or /blog/:slug visited directly (e.g. from Google)
  // Vercel rewrites to index.html; we detect the path here and set the initial route.
  const isBlogPathRoute = pathname === "blog" || pathname.startsWith("blog/");

  const initialRoute = parseHash();
  const initialSession =
    initialRoute.path === "detail"
      ? loadDetailFromSession()
      : { product: null, results: [] };

  // If the visitor landed on an unknown path (not root, not SEO route, not blog),
  // treat it as a 404 from the start — don't silently fall back to home.
  const isUnknownPathRoute = pathname !== "" && !seoMatch && !isBlogPathRoute;

  const [route, setRoute] = useState(
    seoMatch
      ? {
          path: "results",
          params: { q: seoMatch.query, cat: seoMatch.category },
        }
      : isBlogPathRoute
        ? { path: pathname, params: {} } // e.g. "blog" or "blog/how-to-spot-fake-reviews-amazon-india"
        : isUnknownPathRoute
          ? { path: "404", params: {} }
          : initialRoute,
  );
  const [selectedProduct, setProduct] = useState(initialSession.product);
  const [searchResults, setResults] = useState(initialSession.results);
  const [showAdmin, setShowAdmin] = useState(false);
  const [maintenance, setMaintenance] = useState(null); // null = not yet fetched
  const [activeSeoMeta, setSeoMeta] = useState(seoMatch || null);

  // Track last search query so onBack from DetailPage restores the right results
  const lastSearchRef = useRef(
    (() => {
      try {
        return JSON.parse(sessionStorage.getItem("bp_last_search") || "{}");
      } catch (_) {
        return {};
      }
    })(),
  );

  // Whether this device is bypassing maintenance (admin access)
  const isAdminBypass = window.location.search.includes("admin=1");

  // ── MAINTENANCE POLLING ─────────────────────────────────────────
  async function checkMaintenance() {
    try {
      const r = await fetch(`${API_BASE}/admin/status`, { cache: "no-store" });
      if (!r.ok) {
        setMaintenance((m) => m ?? { enabled: false, message: "", eta: "" });
        return;
      }
      const data = await r.json();
      setMaintenance({
        enabled: Boolean(data.maintenance) && !isAdminBypass,
        message: data.message || "We are performing scheduled maintenance.",
        eta: data.eta || "",
      });
    } catch (_) {
      // Server offline — don't show maintenance, but unblock the UI
      setMaintenance({ enabled: false, message: "", eta: "" });
    }
  }

  useEffect(() => {
    checkMaintenance();
    const t = setInterval(checkMaintenance, 60_000);
    return () => clearInterval(t);
  }, []);

  // ── INJECT STRUCTURED DATA FOR SEO ─────────────────────────────
  useEffect(() => {
    const sd = document.createElement("script");
    sd.type = "application/ld+json";
    sd.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "bestpickr",
      url: "https://bestpickr.in",
      description:
        "AI-powered product comparison across Amazon & Flipkart. Best rated products in India.",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://bestpickr.in/#/results?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    });
    document.head.appendChild(sd);
  }, []);

  // ── SEO META TAGS — set on landing ─────────────────────────────
  useEffect(() => {
    if (!seoMatch) return;
    document.title = seoMatch.title;
    const setMeta = (sel, val) => {
      const el = document.querySelector(sel);
      if (el) el.content = val;
    };
    setMeta('meta[name="description"]', seoMatch.description);
    setMeta('meta[name="keywords"]', seoMatch.keywords);
    setMeta('meta[property="og:title"]', seoMatch.title);
    setMeta('meta[property="og:description"]', seoMatch.description);
    trackPageView("seo-landing", { query: seoMatch.query, path: pathname });
  }, []);

  // ── HASH CHANGE LISTENER ───────────────────────────────────────
  useEffect(() => {
    function onHashChange() {
      const r = parseHash();
      setRoute(r);
      setSeoMeta(null);
      if (r.path !== "admin") setShowAdmin(false);
      if (r.path === "detail") {
        const { product, results } = loadDetailFromSession();
        if (product) {
          setProduct(product);
          setResults(results);
        }
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ── POPSTATE LISTENER (blog back/forward button) ───────────────
  // When the user hits Back after visiting a /blog/... URL, the browser
  // fires popstate. We read the new pathname and update route state.
  useEffect(() => {
    function onPopState() {
      const pn = window.location.pathname.replace(/^\//, "");
      if (pn === "blog" || pn.startsWith("blog/")) {
        setSeoMeta(null);
        setRoute({ path: pn, params: {} });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // For hash-based routes, fall back to hash parsing
      const r = parseHash();
      setRoute(r);
      setSeoMeta(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ── PAGE TITLE ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeSeoMeta) return;
    document.title = PAGE_TITLES[route.path] || "bestpickr";
  }, [route.path, activeSeoMeta]);

  // ── ADMIN SHORTCUT ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.shiftKey && e.key === "F12") setShowAdmin(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (parseHash().path === "admin") setShowAdmin(true);
    trackPageView(route.path || "home");
  }, []);

  // ── NAVIGATION ─────────────────────────────────────────────────
  const navigate = useCallback((path, params = {}) => {
    setSeoMeta(null);
    // Blog routes use clean /blog/... paths for SEO — no hash fragment.
    // Vercel already rewrites all paths to index.html, so these URLs are
    // fully crawlable by Google without a # in the address bar.
    if (path === "blog" || path.startsWith("blog/")) {
      window.history.pushState(null, "", "/" + path);
      setRoute({ path, params });
      window.scrollTo({ top: 0, behavior: "smooth" });
      trackPageView(path, params);
      return;
    }
    // For non-blog routes: if on a non-root pathname, silently fix to '/'.
    if (window.location.pathname.replace(/^\//, "") !== "") {
      window.history.replaceState(null, "", "/");
    }
    setHash(path === "home" ? "" : path, params);
    setRoute({ path: path === "home" ? "/" : path, params });
    window.scrollTo({ top: 0, behavior: "smooth" });
    trackPageView(path, params);
  }, []);

  function handleSearch(q, cat = "") {
    trackSearch(q, cat, 0);
    setSeoMeta(null);
    // Remember last search so DetailPage's back button can restore it
    lastSearchRef.current = { q, cat };
    try {
      sessionStorage.setItem("bp_last_search", JSON.stringify({ q, cat }));
    } catch (_) {}
    // If on a bad pathname, silently correct to '/' without a page reload.
    if (window.location.pathname.replace(/^\//, "") !== "") {
      window.history.replaceState(null, "", "/");
    }
    setHash("results", { q, cat });
    setRoute({ path: "results", params: { q, cat } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleViewProduct(product, results) {
    setProduct(product);
    setResults(results);
    saveDetailToSession(product, results);
    setHash("detail", { id: product.id || product.name?.slice(0, 40) });
    setRoute({ path: "detail", params: {} });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── RENDER: LOADING (awaiting first maintenance check) ─────────
  if (maintenance === null) {
    return <div style={{ minHeight: "100vh", background: "#080e0a" }} />;
  }

  // ── RENDER: ADMIN ──────────────────────────────────────────────
  if (showAdmin) {
    return (
      <AdminDashboard
        onClose={() => {
          setShowAdmin(false);
          setHash("");
        }}
        maintenance={maintenance}
        onMaintenanceChange={setMaintenance}
        adminToken={import.meta.env.VITE_ADMIN_TOKEN || "bestpickr-admin-2025"}
      />
    );
  }

  const { path, params } = route;
  const isHome = path === "/" || path === "";
  const isBlogRoute = path === "blog" || path.startsWith("blog/");

  // ── RENDER: 404 FALLBACK (checked FIRST — before maintenance) ──
  // Must run before maintenance so broken URLs show 404, not a maintenance
  // page. Static page keys + known nav routes are all explicitly listed.
  const staticPageKeys = [
    "about",
    "how-it-works",
    "ai-score",
    "price-alerts",
    "privacy",
    "terms",
    "affiliate-disclosure",
  ];
  const knownRoutes = ["/", "", "results", "detail", "admin"];
  const is404 =
    !knownRoutes.includes(path) &&
    !staticPageKeys.includes(path) &&
    !isBlogRoute;

  if (is404) {
    return (
      <>
        <Navbar
          currentPage="404"
          currentQuery=""
          onSearch={handleSearch}
          onHome={() => navigate("home")}
        />
        <NotFoundPage
          onSearch={handleSearch}
          onHome={() => navigate("home")}
          onNav={navigate}
        />
        <Footer
          onSearch={handleSearch}
          onNav={navigate}
          onAdmin={() => setShowAdmin(true)}
        />
      </>
    );
  }

  // ── RENDER: MAINTENANCE ────────────────────────────────────────
  // Blog routes are allowed through — Instagram visitors can read
  // posts even while the main product app is locked down.
  if (maintenance.enabled && !isBlogRoute) {
    return (
      <MaintenancePage message={maintenance.message} eta={maintenance.eta} />
    );
  }

  // ── RENDER: BLOG ROUTES ────────────────────────────────────────
  // During maintenance: dark minimal nav + no footer + no product CTA.
  // During normal mode: standard Navbar + Footer.
  if (path === "blog") {
    return (
      <>
        {maintenance.enabled ? (
          <MaintenanceBlogNav
            onBack={() => navigate("home")}
          />
        ) : (
          <Navbar
            currentPage="blog"
            currentQuery=""
            onSearch={handleSearch}
            onHome={() => navigate("home")}
          />
        )}
        <BlogPage
          onSearch={handleSearch}
          onNav={navigate}
          maintenanceMode={maintenance.enabled}
        />
        {!maintenance.enabled && (
          <Footer
            onSearch={handleSearch}
            onNav={navigate}
            onAdmin={() => setShowAdmin(true)}
          />
        )}
      </>
    );
  }
  if (path.startsWith("blog/")) {
    const slug = path.slice(5);
    return (
      <>
        {maintenance.enabled ? (
          <MaintenanceBlogNav
            onBack={() => navigate("blog")}
          />
        ) : (
          <Navbar
            currentPage="blog"
            currentQuery=""
            onSearch={handleSearch}
            onHome={() => navigate("home")}
          />
        )}
        <BlogPostPage
          slug={slug}
          onSearch={handleSearch}
          onHome={() => navigate("home")}
          maintenanceMode={maintenance.enabled}
        />
        {!maintenance.enabled && (
          <Footer
            onSearch={handleSearch}
            onNav={navigate}
            onAdmin={() => setShowAdmin(true)}
          />
        )}
      </>
    );
  }

  const staticPages = {
    about: <AboutPage onHome={() => navigate("home")} onNav={navigate} />,
    "how-it-works": <HowItWorksPage onHome={() => navigate("home")} />,
    "ai-score": <AIScorePage onHome={() => navigate("home")} />,
    "price-alerts": <PriceAlertsPage onHome={() => navigate("home")} />,
    privacy: <PrivacyPage onHome={() => navigate("home")} />,
    terms: <TermsPage onHome={() => navigate("home")} />,
    "affiliate-disclosure": (
      <AffiliateDisclosurePage
        onHome={() => navigate("home")}
        onNav={navigate}
      />
    ),
  };
  if (staticPages[path]) {
    return (
      <>
        <Navbar
          currentPage={path}
          currentQuery=""
          onSearch={handleSearch}
          onHome={() => navigate("home")}
        />
        {staticPages[path]}
        <Footer
          onSearch={handleSearch}
          onNav={navigate}
          onAdmin={() => setShowAdmin(true)}
        />
      </>
    );
  }

  return (
    <>
      <Navbar
        currentPage={isHome ? "home" : path}
        currentQuery={params.q || activeSeoMeta?.query || ""}
        onSearch={handleSearch}
        onHome={() => navigate("home")}
      />

      {/* SEO landing page banner — visible when arriving from Google */}
      {activeSeoMeta && path === "results" && (
        <div
          style={{
            background: "var(--accent-bg)",
            borderBottom: "2px solid #C8E6D4",
            padding: "18px 0",
          }}
        >
          <div className="wrap">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".5px",
                textTransform: "uppercase",
                color: "var(--accent)",
                marginBottom: 6,
              }}
            >
              🔍 Showing live results for your search
            </div>
            <h1
              style={{
                fontSize: "clamp(17px,3vw,24px)",
                fontWeight: 700,
                color: "var(--ink)",
                margin: "0 0 4px",
                letterSpacing: "-.3px",
                lineHeight: 1.3,
              }}
            >
              {activeSeoMeta.h1}
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink3)",
                margin: 0,
                lineHeight: 1.6,
                maxWidth: 620,
              }}
            >
              {activeSeoMeta.description}
            </p>
          </div>
        </div>
      )}

      {isHome && (
        <HomePage
          onSearch={handleSearch}
          onViewProduct={handleViewProduct}
          onNav={navigate}
        />
      )}

      {path === "results" && (
        <ErrorBoundary onRetry={() => window.location.reload()}>
          <ResultsPage
            query={params.q || activeSeoMeta?.query || ""}
            category={params.cat || activeSeoMeta?.category || ""}
            onViewProduct={handleViewProduct}
            onSearch={handleSearch}
          />
        </ErrorBoundary>
      )}

      {path === "detail" && (
        <ErrorBoundary onRetry={() => window.history.back()}>
          <DetailPage
            product={selectedProduct}
            allResults={searchResults}
            onViewProduct={handleViewProduct}
            onBack={() => {
              const { q = "", cat = "" } = lastSearchRef.current;
              navigate("results", { q, cat });
            }}
            onHome={() => navigate("home")}
          />
        </ErrorBoundary>
      )}

      <Footer
        onSearch={handleSearch}
        onNav={navigate}
        onAdmin={() => setShowAdmin(true)}
      />
    </>
  );
}
