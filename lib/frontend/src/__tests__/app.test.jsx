/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App.jsx'

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch')
    globalThis.EventSource = vi.fn(function () {
      return { onmessage: null, onerror: null, close: vi.fn() }
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows disabled search box and Create Index button when no index', async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ indexed: false, fileCount: 0 }) })
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create index/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('searchbox')).toBeDisabled()
  })

  it('shows Re-Index button and active search box when index exists', async () => {
    fetch.mockResolvedValue({ json: () => Promise.resolve({ indexed: true, fileCount: 42 }) })
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-index/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('searchbox')).not.toBeDisabled()
  })

  it('enters indexing state when index button is clicked', async () => {
    const user = userEvent.setup()
    fetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ indexed: false, fileCount: 0 }) })
      .mockResolvedValueOnce({ status: 202, json: () => Promise.resolve({ started: true }) })

    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: /create index/i })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: /create index/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /indexing/i })).toBeDisabled()
    })
  })

  it('does not get stuck in indexing when done event arrives before 202 response', async () => {
    const user = userEvent.setup()

    let messageHandler = null
    const mockES = { close: vi.fn() }
    Object.defineProperty(mockES, 'onmessage', {
      set(fn) {
        messageHandler = fn
      },
      configurable: true,
    })
    globalThis.EventSource = vi.fn(function () {
      return mockES
    })

    fetch
      .mockResolvedValueOnce({ json: () => Promise.resolve({ indexed: false, fileCount: 0 }) })
      .mockImplementationOnce(() => {
        // Fire done: true synchronously before this promise resolves (simulates race)
        messageHandler?.({ data: JSON.stringify({ done: true, fileCount: 0 }) })
        return Promise.resolve({ status: 202, json: () => Promise.resolve({ started: true }) })
      })
      .mockResolvedValue({ json: () => Promise.resolve({ indexed: true, fileCount: 0 }) })

    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: /create index/i })).not.toBeDisabled())

    await user.click(screen.getByRole('button', { name: /create index/i }))

    // Should end up in ready state — Re-Index button visible and not disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-index/i })).toBeInTheDocument()
    })
  })
})
