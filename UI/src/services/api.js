// src/services/api.js
// ─────────────────────────────────────────────────────────────────
// Single file for ALL backend API calls.
// Using axios with a base URL so we only change one place
// when switching between dev/staging/production.
// ─────────────────────────────────────────────────────────────────
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',           // Vite proxies /api → localhost:5000
  timeout: 20000,            // 20s — search can be slow (parallel API calls)
  headers: { 'Content-Type': 'application/json' },
})

// ── INTERCEPTORS ───────────────────────────────────────────────────
// Log every request/response in development
api.interceptors.request.use(config => {
  if (import.meta.env.DEV) console.log(`→ ${config.method?.toUpperCase()} ${config.url}`, config.data || '')
  return config
})
api.interceptors.response.use(
  res  => { if (import.meta.env.DEV) console.log(`← ${res.status}`, res.config.url); return res },
  err  => {
    console.error('API error:', err.response?.data || err.message)
    return Promise.reject(err)
  }
)

// ── API METHODS ────────────────────────────────────────────────────

/** Search products across all platforms */
export const searchProducts = (query, category = '') =>
  api.post('/search', { query, category }).then(r => r.data)

/** Autocomplete suggestions */
export const getSuggestions = (q) =>
  api.get('/search/suggestions', { params: { q } }).then(r => r.data)

/** Get all categories */
export const getCategories = () =>
  api.get('/categories').then(r => r.data)

/** Get top-ranked products for a category */
export const getTopProducts = (category, limit = 10) =>
  api.get('/products/top', { params: { category, limit } }).then(r => r.data)

/** Get single product detail */
export const getProduct = (id) =>
  api.get(`/products/${id}`).then(r => r.data)

/** Health check */
export const checkHealth = () =>
  api.get('/health').then(r => r.data)

export default api
