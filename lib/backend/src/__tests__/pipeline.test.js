/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../indexer/scanner.js', () => ({ scanDirectory: vi.fn() }))
vi.mock('../indexer/extractor.js', () => ({ extractFile: vi.fn() }))
vi.mock('../indexer/state.js', () => ({ getSubscribers: vi.fn().mockReturnValue(new Set()) }))

import { scanDirectory } from '../indexer/scanner.js'
import { extractFile } from '../indexer/extractor.js'
import { runIndexing } from '../indexer/pipeline.js'
import { createDb } from '../db/schema.js'
import { upsertFile } from '../db/queries.js'
import { getFileMtime, getIndexStatus } from '../db/queries.js'

describe('runIndexing', () => {
  let db

  beforeEach(() => {
    db = createDb(':memory:')
    scanDirectory.mockReset()
    extractFile.mockReset()
  })

  it('indexes new files', async () => {
    scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 1000, size: 100 }])
    extractFile.mockResolvedValue({ content: 'hello world', type: 'txt' })

    await runIndexing({ db, dirs: ['/docs'] })

    expect(getIndexStatus(db).fileCount).toBe(1)
    expect(getFileMtime(db, '/docs/a.txt')).toBe(1000)
  })

  it('skips unchanged files (same mtime)', async () => {
    upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'existing' })
    scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 1000, size: 100 }])

    await runIndexing({ db, dirs: ['/docs'] })

    expect(extractFile).not.toHaveBeenCalled()
  })

  it('re-indexes files with changed mtime', async () => {
    upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'old' })
    scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 2000, size: 200 }])
    extractFile.mockResolvedValue({ content: 'updated', type: 'txt' })

    await runIndexing({ db, dirs: ['/docs'] })

    expect(getFileMtime(db, '/docs/a.txt')).toBe(2000)
  })

  it('removes files no longer present on disk', async () => {
    upsertFile(db, { path: '/docs/gone.txt', mtime: 999, size: 1, type: 'txt', content: 'old' })
    scanDirectory.mockResolvedValue([])

    await runIndexing({ db, dirs: ['/docs'] })

    expect(getFileMtime(db, '/docs/gone.txt')).toBeNull()
  })

  it('returns total file count', async () => {
    scanDirectory.mockResolvedValue([
      { path: '/a.txt', mtime: 1, size: 1 },
      { path: '/b.txt', mtime: 1, size: 1 },
    ])
    extractFile.mockResolvedValue({ content: 'x', type: 'txt' })

    const count = await runIndexing({ db, dirs: ['/'] })
    expect(count).toBe(2)
  })
})
