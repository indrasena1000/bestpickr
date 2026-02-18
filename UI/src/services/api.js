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
  api.post("/search", { query, category }).then((r) => r.data);

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

export default api;
