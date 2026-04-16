/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useCallback, useEffect } from 'react'

/**
 * Fetches the current index status from the backend.
 * Exposes a refetch function so the caller can refresh after indexing completes.
 * @returns {{ indexed: boolean, fileCount: number, loading: boolean, refetch: () => Promise<void> }}
 */
export function useIndexStatus() {
  const [state, setState] = useState({ indexed: false, fileCount: 0, loading: true })

  const refetch = useCallback(async () => {
    const res = await fetch('/api/status')
    const data = await res.json()
    setState({ indexed: data.indexed, fileCount: data.fileCount, loading: false })
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { ...state, refetch }
}
