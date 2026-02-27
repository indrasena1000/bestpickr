// src/hooks/useSearch.js
// Updated contract for hybrid intent-based search architecture.
// Handles: immediate response, async job polling, session cache restore.
import { useState, useCallback, useEffect, useRef } from 'react'
import { searchProducts, getSuggestions } from '../services/api'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// ── Session cache ─────────────────────────────────────────────────
const cacheKey = (q) => `bp_search:${q.toLowerCase().trim()}`
function readCache(q) {
  try { const r = sessionStorage.getItem(cacheKey(q)); return r ? JSON.parse(r) : null }
  catch { return null }
}
function writeCache(q, data) {
  try { sessionStorage.setItem(cacheKey(q), JSON.stringify(data)) } catch (_) {}
}

// ── Empty state ───────────────────────────────────────────────────
function emptyState() {
  return {
    intent:          null,
    confidence:      null,
    primaryProduct:  null,
    suggestions:     [],
    status:          'ready',
    jobId:           null,
    source:          null,
    executionTimeMs: 0,
    isLoading:       false,
    error:           null,
    fromCache:       false,
    // Legacy compat — ResultsPage still reads .results in some paths
    results:         [],
  }
}

export function useSearch() {
  const [state, setState] = useState(emptyState)
  const abortRef  = useRef(null)
  const pollRef   = useRef(null)

  // Stop polling on unmount
  useEffect(() => () => { clearInterval(pollRef.current) }, [])

  // ── Polling effect: auto-poll when status is fetching/partial ────
  useEffect(() => {
    const { status, jobId } = state
    if ((status === 'fetching' || status === 'partial') && jobId) {
      clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const res  = await fetch(`${API_BASE}/search/status/${jobId}`)
          const data = await res.json()
          if (data.status === 'ready' || data.status === 'failed') {
            clearInterval(pollRef.current)
            setState(prev => ({
              ...prev,
              ...data,
              suggestions: data.suggestions || [],
              results:     data.suggestions || [],   // legacy compat
              isLoading:   false,
            }))
          } else if (data.status === 'partial' && data.primaryProduct) {
            setState(prev => ({
              ...prev,
              status:         'partial',
              primaryProduct: data.primaryProduct,
            }))
          }
        } catch (err) {
          console.warn('useSearch poll error:', err.message)
        }
      }, 2000)
    } else {
      clearInterval(pollRef.current)
    }
  }, [state.status, state.jobId])

  const search = useCallback(async (query, category = '') => {
    if (!query?.trim()) return

    // Session cache hit — instant restore, no API call
    const cached = readCache(query)
    if (cached) {
      setState({ ...emptyState(), ...cached, isLoading: false, fromCache: true,
                 results: cached.suggestions || [] })
      return
    }

    if (abortRef.current) abortRef.current.abort()
    setState(prev => ({ ...prev, isLoading: true, error: null,
                        primaryProduct: null, suggestions: [], results: [] }))

    try {
      const data = await searchProducts(query.trim(), category)

      const next = {
        intent:          data.intent          || null,
        confidence:      data.confidence      ?? null,
        primaryProduct:  data.primaryProduct  || null,
        suggestions:     data.suggestions     || data.results || [],
        results:         data.suggestions     || data.results || [],   // legacy
        status:          data.status          || 'ready',
        jobId:           data.jobId           || null,
        source:          data.source          || null,
        executionTimeMs: data.executionTimeMs || data.elapsed_ms || 0,
        isLoading:       data.status === 'fetching',
        error:           null,
        fromCache:       data.fromCache       || false,
        // Keep meta compat for existing ResultsPage
        meta: {
          fromCache:   data.fromCache,
          elapsed:     data.executionTimeMs || data.elapsed_ms,
          platforms:   data.platforms,
          source:      data.source,
          intent:      data.intent,
          confidence:  data.confidence,
        },
      }

      setState(next)

      // Cache only ready results (not pending jobs)
      if (next.status === 'ready') writeCache(query, next)

    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err.response?.data?.error || 'Search failed. Please try again.',
      }))
    }
  }, [])

  return {
    // New contract
    intent:          state.intent,
    confidence:      state.confidence,
    primaryProduct:  state.primaryProduct,
    suggestions:     state.suggestions,
    status:          state.status,
    jobId:           state.jobId,
    source:          state.source,
    executionTimeMs: state.executionTimeMs,
    isLoading:       state.isLoading,
    error:           state.error,
    fromCache:       state.fromCache,
    meta:            state.meta,
    // Legacy compat
    results:         state.results,
    loading:         state.isLoading,
    search,
  }
}

// ── Debounced suggestions (unchanged) ────────────────────────────
export function useSuggestions() {
  const [suggestions, setSuggestions] = useState([])
  const timerRef = useRef(null)

  const fetch = useCallback((q) => {
    clearTimeout(timerRef.current)
    if (!q || q.length < 2) { setSuggestions([]); return }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await getSuggestions(q)
        setSuggestions(data.suggestions || [])
      } catch { setSuggestions([]) }
    }, 250)
  }, [])

  return { suggestions, fetch, clear: () => setSuggestions([]) }
}

