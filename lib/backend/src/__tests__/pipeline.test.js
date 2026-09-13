/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../indexer/scanner.js', () => ({ scanDirectory: vi.fn() }))
vi.mock('../indexer/extractor.js', () => ({ extractFile: vi.fn() }))

/** Collects every SSE payload the pipeline broadcasts during a run. */
const sseEvents = []
const subscriber = {
  write(chunk) {
    sseEvents.push(JSON.parse(chunk.replace(/^data: /, '')))
  },
}
vi.mock('../indexer/state.js', () => ({ getSubscribers: vi.fn(() => new Set([subscriber])) }))

import { scanDirectory } from '../indexer/scanner.js'
import { extractFile } from '../indexer/extractor.js'
import { runIndexing } from '../indexer/pipeline.js'
import { createDb } from '../db/schema.js'
import { upsertFile, getFileMtime, getFileHash, getIndexStatus, getAllPaths, search } from '../db/queries.js'

/** @returns {object | undefined} The summary event broadcast at the start of a run. */
function summaryEvent() {
  return sseEvents.find((e) => e.summary)
}

/** @returns {object[]} Per-file progress events, excluding summary and done. */
function progressEvents() {
  return sseEvents.filter((e) => !e.summary && !e.done)
}

describe('runIndexing', () => {
  let db

  beforeEach(() => {
    db = createDb(':memory:')
    scanDirectory.mockReset()
    extractFile.mockReset()
    sseEvents.length = 0
  })

  describe('change detection', () => {
    it('indexes new files', async () => {
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 1000, size: 100, hash: 'h1' }])
      extractFile.mockResolvedValue({ content: 'hello world', type: 'txt' })

      await runIndexing({ db, dirs: ['/docs'] })

      expect(getIndexStatus(db).fileCount).toBe(1)
      expect(getFileMtime(db, '/docs/a.txt')).toBe(1000)
      expect(getFileHash(db, '/docs/a.txt')).toBe('h1')
    })

    it('skips a file whose content hash is unchanged', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'existing', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 1000, size: 100, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/docs'] })

      expect(extractFile).not.toHaveBeenCalled()
    })

    it('skips a file that was touched but not edited', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'existing', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 9999, size: 100, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/docs'] })

      expect(extractFile).not.toHaveBeenCalled()
      // The bumped mtime is absorbed so the next run compares cleanly.
      expect(getFileMtime(db, '/docs/a.txt')).toBe(9999)
    })

    it('re-indexes a file whose content hash changed', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'old', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 2000, size: 200, hash: 'h2' }])
      extractFile.mockResolvedValue({ content: 'updated', type: 'txt' })

      await runIndexing({ db, dirs: ['/docs'] })

      expect(extractFile).toHaveBeenCalledTimes(1)
      expect(getFileHash(db, '/docs/a.txt')).toBe('h2')
      expect(search(db, 'updated')).toHaveLength(1)
      expect(search(db, 'old')).toHaveLength(0)
    })

    it('removes files no longer present on disk', async () => {
      upsertFile(db, { path: '/docs/gone.txt', mtime: 999, size: 1, type: 'txt', content: 'old', hash: 'h1' })
      scanDirectory.mockResolvedValue([])

      await runIndexing({ db, dirs: ['/docs'] })

      expect(getFileMtime(db, '/docs/gone.txt')).toBeNull()
      expect(search(db, 'old')).toHaveLength(0)
    })
  })

  describe('moved files', () => {
    it('renames a moved file instead of re-extracting it', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'pdf', content: 'ocr text', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/archive/a.txt', mtime: 1000, size: 100, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/'] })

      expect(extractFile).not.toHaveBeenCalled()
      expect(getAllPaths(db)).toEqual(['/archive/a.txt'])
    })

    it('keeps the extracted content of a moved file searchable under its new path', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'pdf', content: 'ocr text', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/archive/a.txt', mtime: 1000, size: 100, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/'] })

      const results = search(db, 'ocr')
      expect(results).toHaveLength(1)
      expect(results[0].path).toBe('/archive/a.txt')
    })

    it('counts a move as neither added nor removed', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'x', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/archive/a.txt', mtime: 1000, size: 100, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/'] })

      expect(summaryEvent()).toMatchObject({ moved: 1, added: 0, removed: 0, total: 0 })
    })
  })

  describe('upgrading an index written before hashes existed', () => {
    it('backfills the hash without re-extracting an unchanged file', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'existing' })
      expect(getFileHash(db, '/docs/a.txt')).toBeNull()
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 1000, size: 100, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/docs'] })

      expect(extractFile).not.toHaveBeenCalled()
      expect(getFileHash(db, '/docs/a.txt')).toBe('h1')
      expect(search(db, 'existing')).toHaveLength(1)
    })

    it('re-indexes a file that changed while the index had no hash', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 100, type: 'txt', content: 'old' })
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 2000, size: 100, hash: 'h1' }])
      extractFile.mockResolvedValue({ content: 'updated', type: 'txt' })

      await runIndexing({ db, dirs: ['/docs'] })

      expect(extractFile).toHaveBeenCalledTimes(1)
      expect(getFileHash(db, '/docs/a.txt')).toBe('h1')
    })
  })

  describe('progress reporting', () => {
    it('counts only the dirty files in the progress total', async () => {
      upsertFile(db, { path: '/docs/keep.txt', mtime: 1, size: 1, type: 'txt', content: 'keep', hash: 'keep' })
      scanDirectory.mockResolvedValue([
        { path: '/docs/keep.txt', mtime: 1, size: 1, hash: 'keep' },
        { path: '/docs/new.txt', mtime: 1, size: 1, hash: 'new' },
      ])
      extractFile.mockResolvedValue({ content: 'x', type: 'txt' })

      await runIndexing({ db, dirs: ['/docs'] })

      expect(progressEvents().map((e) => e.total)).toEqual([1])
      expect(progressEvents()).toHaveLength(1)
    })

    it('emits no per-file progress event for an unchanged file', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1, size: 1, type: 'txt', content: 'x', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 1, size: 1, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/docs'] })

      expect(progressEvents()).toEqual([])
    })

    it('broadcasts a summary of the diff before doing any work', async () => {
      upsertFile(db, { path: '/docs/keep.txt', mtime: 1, size: 1, type: 'txt', content: 'x', hash: 'keep' })
      upsertFile(db, { path: '/docs/edit.txt', mtime: 1, size: 1, type: 'txt', content: 'x', hash: 'old' })
      upsertFile(db, { path: '/docs/gone.txt', mtime: 1, size: 1, type: 'txt', content: 'x', hash: 'gone' })
      scanDirectory.mockResolvedValue([
        { path: '/docs/keep.txt', mtime: 1, size: 1, hash: 'keep' },
        { path: '/docs/edit.txt', mtime: 2, size: 2, hash: 'new' },
        { path: '/docs/fresh.txt', mtime: 1, size: 1, hash: 'fresh' },
      ])
      extractFile.mockResolvedValue({ content: 'x', type: 'txt' })

      await runIndexing({ db, dirs: ['/docs'] })

      expect(sseEvents[0]).toMatchObject({
        summary: true,
        scanned: 3,
        unchanged: 1,
        modified: 1,
        added: 1,
        removed: 1,
        moved: 0,
        total: 2,
      })
    })

    it('always ends with a done event', async () => {
      scanDirectory.mockResolvedValue([])

      await runIndexing({ db, dirs: ['/docs'] })

      expect(sseEvents.at(-1)).toMatchObject({ done: true })
    })

    it('reports a run with nothing to do as complete', async () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1, size: 1, type: 'txt', content: 'x', hash: 'h1' })
      scanDirectory.mockResolvedValue([{ path: '/docs/a.txt', mtime: 1, size: 1, hash: 'h1' }])

      await runIndexing({ db, dirs: ['/docs'] })

      expect(summaryEvent()).toMatchObject({ total: 0, unchanged: 1 })
      expect(sseEvents.at(-1)).toMatchObject({ done: true })
    })
  })

  describe('return value', () => {
    it('returns a summary of what the run did', async () => {
      upsertFile(db, { path: '/keep.txt', mtime: 1, size: 1, type: 'txt', content: 'x', hash: 'keep' })
      scanDirectory.mockResolvedValue([
        { path: '/keep.txt', mtime: 1, size: 1, hash: 'keep' },
        { path: '/a.txt', mtime: 1, size: 1, hash: 'a' },
        { path: '/b.txt', mtime: 1, size: 1, hash: 'b' },
      ])
      extractFile.mockResolvedValue({ content: 'x', type: 'txt' })

      const summary = await runIndexing({ db, dirs: ['/'] })

      expect(summary).toMatchObject({ scanned: 3, unchanged: 1, added: 2, indexed: 2 })
    })

    it('keeps going when a single file fails to extract', async () => {
      scanDirectory.mockResolvedValue([
        { path: '/bad.txt', mtime: 1, size: 1, hash: 'bad' },
        { path: '/good.txt', mtime: 1, size: 1, hash: 'good' },
      ])
      extractFile.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ content: 'fine', type: 'txt' })

      const summary = await runIndexing({ db, dirs: ['/'] })

      expect(summary.failed).toBe(1)
      expect(getAllPaths(db)).toEqual(['/good.txt'])
    })
  })
})
