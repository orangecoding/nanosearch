/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useRef, useCallback, useEffect } from 'react'

/**
 * Manages a Server-Sent Events connection to /api/index/progress.
 * Uses a ref for the callback to avoid stale closures without reconnecting.
 * @param {(event: object) => void} onEvent - Called with each parsed event payload.
 * @returns {{ connect: () => void, disconnect: () => void }}
 */
export function useSSE(onEvent) {
  const esRef = useRef(null)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource('/api/index/progress')
    es.onmessage = (e) => {
      try {
        onEventRef.current(JSON.parse(e.data))
      } catch {
        // Ignore malformed events
      }
    }
    esRef.current = es
  }, [])

  const disconnect = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
  }, [])

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return { connect, disconnect }
}
