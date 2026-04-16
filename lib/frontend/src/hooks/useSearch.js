/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useCallback } from 'react'

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

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&exact=${exact}`)
      setResults(await res.json())
    }, 300)
    return () => clearTimeout(timer)
  }, [query, exact])

  /**
   * Sends a pre-built FTS5 expression to the backend without any transformation.
   * Used by the query builder where the expression is constructed client-side.
   * @param {string} ftsQuery
   */
  const searchRaw = useCallback(async (ftsQuery) => {
    if (!ftsQuery.trim()) {
      setResults([])
      return
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(ftsQuery)}&raw=true`)
      setResults(await res.json())
    } catch {
      setResults([])
    }
  }, [])

  return { results, setResults, query, setQuery, exact, setExact, searchRaw }
}
