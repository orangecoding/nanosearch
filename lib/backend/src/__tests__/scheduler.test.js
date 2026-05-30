/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../indexer/pipeline.js', () => ({ runIndexing: vi.fn() }))

import { runIndexing } from '../indexer/pipeline.js'
import { startRescanScheduler, triggerRescan } from '../indexer/scheduler.js'
import { isIndexing, setIndexing } from '../indexer/state.js'

describe('rescan scheduler', () => {
  beforeEach(() => {
    runIndexing.mockReset()
    runIndexing.mockResolvedValue(0)
    setIndexing(false)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    setIndexing(false)
  })

  it('does not start a timer when interval is 0 (disabled)', () => {
    const timer = startRescanScheduler({ db: {}, dirs: ['/docs'], intervalHours: 0 })
    expect(timer).toBeNull()
    vi.advanceTimersByTime(60 * 60 * 1000 * 24)
    expect(runIndexing).not.toHaveBeenCalled()
  })

  it('does not start a timer for negative/invalid interval', () => {
    expect(startRescanScheduler({ db: {}, dirs: [], intervalHours: -5 })).toBeNull()
  })

  it('runs indexing every interval when enabled', async () => {
    const timer = startRescanScheduler({ db: {}, dirs: ['/docs'], intervalHours: 2 })
    expect(timer).not.toBeNull()

    expect(runIndexing).not.toHaveBeenCalled()
    // advanceTimersByTimeAsync also flushes the pending promises inside
    // triggerRescan so the indexing flag is reset before the next tick.
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    expect(runIndexing).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    expect(runIndexing).toHaveBeenCalledTimes(2)
  })

  it('triggerRescan runs indexing and toggles the indexing flag', async () => {
    let duringRun = false
    runIndexing.mockImplementation(async () => {
      duringRun = isIndexing()
      return 3
    })

    await triggerRescan({ db: {}, dirs: ['/docs'] })

    expect(runIndexing).toHaveBeenCalledTimes(1)
    expect(duringRun).toBe(true)
    expect(isIndexing()).toBe(false)
  })

  it('triggerRescan skips when indexing already in progress', async () => {
    setIndexing(true)
    await triggerRescan({ db: {}, dirs: ['/docs'] })
    expect(runIndexing).not.toHaveBeenCalled()
  })

  it('triggerRescan resets the indexing flag even if indexing throws', async () => {
    runIndexing.mockRejectedValue(new Error('boom'))
    await triggerRescan({ db: {}, dirs: ['/docs'] })
    expect(isIndexing()).toBe(false)
  })
})
