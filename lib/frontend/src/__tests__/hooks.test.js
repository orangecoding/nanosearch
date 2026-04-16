/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useIndexStatus } from '../hooks/useIndexStatus.js'
import { useSearch } from '../hooks/useSearch.js'
import { useSSE } from '../hooks/useSSE.js'

describe('useIndexStatus', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => vi.restoreAllMocks())

  it('starts in loading state', () => {
    fetch.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useIndexStatus())
    expect(result.current.loading).toBe(true)
  })

  it('sets indexed and fileCount from API response', async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ indexed: true, fileCount: 42 }) })
    const { result } = renderHook(() => useIndexStatus())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.indexed).toBe(true)
    expect(result.current.fileCount).toBe(42)
  })

  it('refetch re-fetches the status', async () => {
    fetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ indexed: false, fileCount: 0 }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ indexed: true, fileCount: 5 }) })

    const { result } = renderHook(() => useIndexStatus())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.refetch())
    expect(result.current.fileCount).toBe(5)
  })
})

describe('useSearch', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch')
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('does not fetch for empty query', async () => {
    const { result } = renderHook(() => useSearch())
    act(() => result.current.setQuery(''))
    vi.advanceTimersByTime(400)
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })

  it('clears results when query is cleared', async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve([{ path: '/a.txt', filename: 'a.txt', type: 'txt', snippet: 'x' }]),
    })
    const { result } = renderHook(() => useSearch())

    act(() => result.current.setQuery('hello'))
    vi.advanceTimersByTime(350)
    await waitFor(() => expect(result.current.results).toHaveLength(1))

    act(() => result.current.setQuery(''))
    vi.advanceTimersByTime(350)
    expect(result.current.results).toEqual([])
  })

  it('debounces requests by 300ms', async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve([]) })
    const { result } = renderHook(() => useSearch())

    act(() => result.current.setQuery('hello'))
    vi.advanceTimersByTime(200)
    expect(fetch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith('/api/search?q=hello&exact=false')
  })
})

describe('useSSE', () => {
  it('connect creates an EventSource and calls onEvent for each message', () => {
    let messageHandler
    const mockES = { onmessage: null, close: vi.fn() }
    globalThis.EventSource = vi.fn(function () {
      Object.defineProperty(mockES, 'onmessage', {
        set(fn) {
          messageHandler = fn
        },
        get() {
          return messageHandler
        },
        configurable: true,
      })
      return mockES
    })

    const onEvent = vi.fn()
    const { result } = renderHook(() => useSSE(onEvent))

    act(() => result.current.connect())

    const fakeEvent = { data: JSON.stringify({ processed: 1, total: 10, percent: 10, eta: -1 }) }
    act(() => messageHandler(fakeEvent))

    expect(onEvent).toHaveBeenCalledWith({ processed: 1, total: 10, percent: 10, eta: -1 })
  })
})
