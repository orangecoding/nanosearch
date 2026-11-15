/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Provides debounced full-text search against /api/search.
 * Standard mode: query goes through buildQuery on the backend (prefix + optional exact).
 * Raw mode: searchRaw() sends a pre-built FTS5 expression directly (used by QueryBuilder).
 * @returns {{ results, setResults, query, setQuery, exact, setExact, searchRaw }}
 */
export function useSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [exact, setExact] = useState(false)

  // Responses can arrive out of order. Every request takes a ticket and only
  // the most recent one may set the results.
  const latest = useRef(0)

  const run = useCallback(async (url) => {
    const ticket = ++latest.current
    let data = []
    try {
      const res = await fetch(url)
      data = await res.json()
    } catch {
      // Network or parse error - show no results rather than stale ones.
    }
    if (ticket === latest.current) setResults(data)
  }, [])

  const clear = useCallback(() => {
    latest.current++
    setResults([])
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      clear()
      return
    }
    const timer = setTimeout(() => run(`/api/search?q=${encodeURIComponent(query)}&exact=${exact}`), 300)
    return () => clearTimeout(timer)
  }, [query, exact, run, clear])

  const searchRaw = useCallback(
    async (ftsQuery) => {
      if (!ftsQuery.trim()) {
        clear()
        return
      }
      await run(`/api/search?q=${encodeURIComponent(ftsQuery)}&raw=true`)
    },
    [run, clear],
  )

  return { results, setResults, query, setQuery, exact, setExact, searchRaw }
}
