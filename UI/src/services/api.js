// src/services/api.js

import axios from "axios";

// ✅ Detect correct API URL automatically
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // needed so the httpOnly refresh cookie is sent
});

// ── In-memory access token store (never touches localStorage/sessionStorage) ──
let _accessToken = null;
let _refreshPromise = null; // prevent multiple simultaneous refresh calls

export function setAccessToken(token) { _accessToken = token; }
export function clearAccessToken()    { _accessToken = null; }
export function getAccessToken()      { return _accessToken; }

// ── REQUEST INTERCEPTOR — attach Bearer token ─────────────────────
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  if (import.meta.env.DEV) {
    console.log(`→ ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.data || "");
  }
  return config;
});

// ── RESPONSE INTERCEPTOR — silent token refresh on 401 ───────────
api.interceptors.response.use(
  (res) => {
    if (import.meta.env.DEV) console.log(`← ${res.status}`, res.config.url);
    return res;
  },
  async (err) => {
    const original = err.config;

    // Only attempt refresh for 401 TOKEN_EXPIRED, once, and not on auth endpoints
    if (
      err.response?.status === 401 &&
      err.response?.data?.code === "TOKEN_EXPIRED" &&
      !original._retried &&
      !original.url.includes("/admin/login") &&
      !original.url.includes("/admin/refresh")
    ) {
      original._retried = true;

      // Deduplicate concurrent refresh calls
      if (!_refreshPromise) {
        _refreshPromise = api.post("/admin/refresh").finally(() => { _refreshPromise = null; });
      }

      try {
        const { data } = await _refreshPromise;
        setAccessToken(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original); // retry original request
      } catch (refreshErr) {
        clearAccessToken();
        // Dispatch event so AdminDashboard can redirect to login
        window.dispatchEvent(new CustomEvent("admin:session-expired"));
        return Promise.reject(refreshErr);
      }
    }

    console.error("API error:", err.response?.data || err.message);
    return Promise.reject(err);
  },
);

// ── ADMIN AUTH ─────────────────────────────────────────────────────
export const adminLogin = (username, password) =>
  api.post("/admin/login", { username, password }).then((r) => r.data);

export const adminRefresh = () =>
  api.post("/admin/refresh").then((r) => r.data);

export const adminLogout = () =>
  api.post("/admin/logout").then((r) => r.data);

// ── API METHODS ────────────────────────────────────────────────────

export const searchProducts = (query, category = "") =>
  api.post("/search", { query, category }, { timeout: 90000 }).then((r) => r.data);

export const getSuggestions = (q) =>
  api.get("/search/suggestions", { params: { q } }).then((r) => r.data);

export const getCategories = () => api.get("/categories").then((r) => r.data);

export const getTopProducts = (category, limit = 10) =>
  api.get("/products/top", { params: { category, limit } }).then((r) => r.data);

export const getTopIndiaProducts = () =>
  api.get("/products/top-india").then((r) => r.data);

export const getProduct = (id) => api.get(`/products/${id}`).then((r) => r.data);

export const checkHealth = () => api.get("/health").then((r) => r.data);

// ── BLOG API ────────────────────────────────────────────────────────

export const getBlogPosts = (params) =>
  api.get("/blog/posts", { params }).then((r) => r.data);

export const getLatestBlogPosts = () =>
  api.get("/blog/posts/latest").then((r) => r.data);

export const getWeeklyBlogPosts = () =>
  api.get("/blog/posts/week").then((r) => r.data);

export const getBlogPost = (slug) =>
  api.get(`/blog/posts/${slug}`).then((r) => r.data);

// ── BLOG ADMIN — token is now automatically injected by the request interceptor ──

export const getAdminBlogPosts  = ()      => api.get("/blog/admin/posts").then((r) => r.data);
export const publishBlogPost    = (id)    => api.patch(`/blog/admin/posts/${id}/publish`, {}).then((r) => r.data);
export const unpublishBlogPost  = (id)    => api.patch(`/blog/admin/posts/${id}/unpublish`, {}).then((r) => r.data);
export const deleteBlogPost     = (id)    => api.delete(`/blog/admin/posts/${id}`).then((r) => r.data);
// 180s timeout — 3 sequential OpenAI calls + RSS fetches can take 60-120s
export const generateBlogPosts  = ()      => api.post("/blog/admin/generate", {}, { timeout: 180000 }).then((r) => r.data);
export const getBlogAnalytics   = ()      => api.get("/blog/admin/analytics").then((r) => r.data);

export default api;
