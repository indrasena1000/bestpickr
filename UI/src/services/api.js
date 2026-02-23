// src/services/api.js

import axios from "axios";

// ✅ Detect correct API URL automatically
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,

  timeout: 20000,

  headers: {
    "Content-Type": "application/json",
  },
});

// ── INTERCEPTORS ───────────────────────────────────────────────────

api.interceptors.request.use((config) => {
  if (import.meta.env.DEV) {
    console.log(
      `→ ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`,
      config.data || "",
    );
  }

  return config;
});

api.interceptors.response.use(
  (res) => {
    if (import.meta.env.DEV) {
      console.log(`← ${res.status}`, res.config.url);
    }

    return res;
  },

  (err) => {
    console.error("API error:", err.response?.data || err.message);

    return Promise.reject(err);
  },
);

// ── API METHODS ────────────────────────────────────────────────────

export const searchProducts = (query, category = "") =>
  api
    .post("/search", { query, category }, { timeout: 90000 })
    .then((r) => r.data);

export const getSuggestions = (q) =>
  api.get("/search/suggestions", { params: { q } }).then((r) => r.data);

export const getCategories = () => api.get("/categories").then((r) => r.data);

export const getTopProducts = (category, limit = 10) =>
  api
    .get("/products/top", {
      params: { category, limit },
    })
    .then((r) => r.data);

export const getProduct = (id) =>
  api.get(`/products/${id}`).then((r) => r.data);

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

export const getAdminBlogPosts = (token) =>
  api
    .get("/blog/admin/posts", { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.data);

export const publishBlogPost = (id, token) =>
  api
    .patch(`/blog/admin/posts/${id}/publish`, {}, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.data);

export const unpublishBlogPost = (id, token) =>
  api
    .patch(`/blog/admin/posts/${id}/unpublish`, {}, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.data);

export const deleteBlogPost = (id, token) =>
  api
    .delete(`/blog/admin/posts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.data);

export const generateBlogPosts = (token) =>
  api
    .post("/blog/admin/generate", {}, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.data);

export default api;
