// src/hooks/useSearch.js
// Updated contract for hybrid intent-based search architecture.
// Handles: immediate response, async job polling, session cache restore.
import { useState, useCallback, useEffect, useRef } from 'react'
import { searchProducts, getSuggestions, getTrending } from '../services/api'

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
    intent:                null,
    confidence:            null,
    matchType:             null,
    detectedCategory:      null,
    primaryProduct:        null,
    suggestions:           [],
    status:                'ready',
    jobId:                 null,
    source:                null,
    executionTimeMs:       0,
    isLoading:             false,
    error:                 null,
    fromCache:             false,
    wasSpellingCorrected:  false,
    correctedQuery:        null,
    // Legacy compat — ResultsPage still reads .results in some paths
    results:               [],
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

      // ── LAZY LOAD: server has DB suggestions ready but primary is pending ──
      // Show suggestions instantly; fetch primary product in the background.
      if (data.primaryPending && data.liveFetchUrl) {
        const suggestions = data.suggestions || data.results || []
        const lazyState = {
          intent:               data.intent                || 'PRODUCT_SPECIFIC',
          confidence:           data.confidence            ?? null,
          matchType:            data.matchType             || null,
          detectedCategory:     data.category              || null,
          primaryProduct:       null,
          suggestions,
          results:              suggestions,
          status:               'lazy_pending',
          jobId:                null,
          source:               data.source                || null,
          executionTimeMs:      data.elapsed_ms            || 0,
          isLoading:            false,
          error:                null,
          fromCache:            false,
          wasSpellingCorrected: data.wasSpellingCorrected  || false,
          correctedQuery:       data.correctedQuery        || null,
          meta: {
            fromCache: false, elapsed: data.elapsed_ms,
            source: data.source, intent: data.intent,
          },
        }
        setState(lazyState)

        // Fire background fetch — silently updates primary when ready
        ;(async () => {
          try {
            const liveRes  = await fetch(data.liveFetchUrl)
            const liveData = await liveRes.json()
            if (liveData.success && liveData.primaryProduct) {
              setState(prev => {
                const next = {
                  ...prev,
                  primaryProduct: liveData.primaryProduct,
                  status:         'ready',
                }
                writeCache(query, next)
                return next
              })
            } else {
              // Primary fetch failed — mark ready so skeleton disappears
              setState(prev => ({ ...prev, status: 'ready' }))
            }
          } catch {
            setState(prev => ({ ...prev, status: 'ready' }))
          }
        })()

        return
      }

      const next = {
        intent:                data.intent                || null,
        confidence:            data.confidence            ?? null,
        matchType:             data.matchType             || null,
        detectedCategory:      data.category              || null,
        primaryProduct:        data.primaryProduct        || null,
        suggestions:           data.suggestions           || data.results || [],
        results:               data.suggestions           || data.results || [],   // legacy
        status:                data.status                || 'ready',
        noResults:             (data.totalResults === 0 && !data.primaryProduct) || false,
        noResultsMessage:      data.message               || null,
        jobId:                 data.jobId                 || null,
        source:                data.source                || null,
        executionTimeMs:       data.executionTimeMs       || data.elapsed_ms || 0,
        isLoading:             data.status === 'fetching',
        error:                 null,
        fromCache:             data.fromCache             || false,
        wasSpellingCorrected:  data.wasSpellingCorrected  || false,
        correctedQuery:        data.correctedQuery        || null,
        // Keep meta compat for existing ResultsPage
        meta: {
          fromCache:   data.fromCache,
          elapsed:     data.executionTimeMs || data.elapsed_ms,
          platforms:   data.platforms,
          source:      data.source,
          intent:      data.intent,
          confidence:  data.confidence,
          matchType:   data.matchType,
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
    intent:                state.intent,
    confidence:            state.confidence,
    matchType:             state.matchType,
    primaryProduct:        state.primaryProduct,
    suggestions:           state.suggestions,
    status:                state.status,
    jobId:                 state.jobId,
    source:                state.source,
    executionTimeMs:       state.executionTimeMs,
    isLoading:             state.isLoading,
    error:                 state.error,
    noResults:             state.noResults,
    noResultsMessage:      state.noResultsMessage,
    fromCache:             state.fromCache,
    wasSpellingCorrected:  state.wasSpellingCorrected,
    correctedQuery:        state.correctedQuery,
    meta:                  state.meta,
    // Legacy compat
    results:               state.results,
    loading:               state.isLoading,
    search,
  }
}

// ── Recent searches (localStorage) ───────────────────────────────
const RECENT_KEY = 'bp_recent_searches'
const MAX_RECENT = 5

function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

export function saveRecent(query) {
  try {
    const existing = getRecents().filter(q => q !== query)
    localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...existing].slice(0, MAX_RECENT)))
  } catch {}
}

// ── Autocomplete suggestions with trending + recents + keyboard nav ────────────
// items: [{ label: string, type: 'recent' | 'trending' | 'suggestion' }]
export function useSuggestions() {
  const [items, setItems]       = useState([])
  const [selIndex, setSelIndex] = useState(-1)
  const timerRef    = useRef(null)
  const trendingRef = useRef([])   // cached on mount, refreshed on focus after 5 min

  // Pre-fetch trending on mount
  useEffect(() => {
    getTrending().then(d => { trendingRef.current = d.trending || [] }).catch(() => {})
  }, [])

  const fetch = useCallback((q) => {
    clearTimeout(timerRef.current)
    setSelIndex(-1)

    if (!q || q.length < 2) {
      // Show recents + trending when query is short/empty
      const recents  = getRecents().slice(0, 3).map(l => ({ label: l, type: 'recent' }))
      const trending = trendingRef.current.slice(0, 5).map(l => ({ label: l, type: 'trending' }))
      setItems([...recents, ...trending])
      return
    }

    timerRef.current = setTimeout(async () => {
      try {
        const data = await getSuggestions(q)
        setItems((data.suggestions || []).slice(0, 6).map(l => ({ label: l, type: 'suggestion' })))
        setSelIndex(-1)
      } catch { setItems([]) }
    }, 250)
  }, [])

  function onFocus(q)  { fetch(q || '') }
  function clear()     { clearTimeout(timerRef.current); setItems([]); setSelIndex(-1) }
  function onBlur()    { setTimeout(clear, 150) }

  function handleKeyDown(e, onPick) {
    if (!items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelIndex(i => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && selIndex >= 0) {
      e.preventDefault()
      onPick(items[selIndex].label)
    } else if (e.key === 'Escape') {
      clear()
    }
  }

  return { items, showDropdown: items.length > 0, selIndex, fetch, onFocus, onBlur, clear, handleKeyDown, saveRecent }
}

