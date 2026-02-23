// src/hooks/useSearch.js
import { useState, useCallback, useRef } from 'react'
import { searchProducts, getSuggestions } from '../services/api'

export function useSearch() {
  const [results,    setResults]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [meta,       setMeta]       = useState(null)   // { fromCache, elapsed_ms, platforms }
  const abortRef = useRef(null)

  const search = useCallback(async (query, category = '') => {
    if (!query?.trim()) return
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort()

    setLoading(true)
    setError(null)
    setResults([])

    try {
      const data = await searchProducts(query.trim(), category)
      setResults(data.results || [])
      setMeta({ fromCache: data.cached, elapsed: data.elapsed_ms, platforms: data.platforms, source: data.source, cacheSource: data.cacheSource })
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  return { results, loading, error, meta, search }
}

// Debounced suggestions hook
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
    }, 250)   // debounce 250ms
  }, [])

  return { suggestions, fetch, clear: () => setSuggestions([]) }
}
