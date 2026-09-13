/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest'
import { classify } from '../indexer/diff.js'

/**
 * Builds a stored-metadata map in the shape returned by getAllFileMeta.
 * @param {Array<{ path: string, mtime: number, size: number, hash: string | null }>} rows
 * @returns {Map<string, { mtime: number, size: number, hash: string | null }>}
 */
function stored(rows) {
  return new Map(rows.map((r) => [r.path, { mtime: r.mtime, size: r.size, hash: r.hash }]))
}

describe('classify', () => {
  it('reports a file that is not in the index as added', () => {
    const diff = classify([{ path: '/d/a.txt', mtime: 1, size: 1, hash: 'h1' }], stored([]))

    expect(diff.added.map((f) => f.path)).toEqual(['/d/a.txt'])
    expect(diff.modified).toEqual([])
    expect(diff.unchanged).toEqual([])
  })

  it('reports a file with an unchanged hash as unchanged', () => {
    const diff = classify(
      [{ path: '/d/a.txt', mtime: 1, size: 1, hash: 'h1' }],
      stored([{ path: '/d/a.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.unchanged.map((f) => f.path)).toEqual(['/d/a.txt'])
    expect(diff.modified).toEqual([])
    expect(diff.metaRefresh).toEqual([])
  })

  it('treats an mtime bump with an unchanged hash as unchanged and refreshes the stored meta', () => {
    const diff = classify(
      [{ path: '/d/a.txt', mtime: 5000, size: 1, hash: 'h1' }],
      stored([{ path: '/d/a.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.unchanged.map((f) => f.path)).toEqual(['/d/a.txt'])
    expect(diff.modified).toEqual([])
    expect(diff.metaRefresh.map((f) => f.path)).toEqual(['/d/a.txt'])
  })

  it('reports a file with a different hash as modified', () => {
    const diff = classify(
      [{ path: '/d/a.txt', mtime: 2, size: 9, hash: 'h2' }],
      stored([{ path: '/d/a.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.modified.map((f) => f.path)).toEqual(['/d/a.txt'])
    expect(diff.unchanged).toEqual([])
  })

  it('reports an indexed file that is gone from disk as removed', () => {
    const diff = classify([], stored([{ path: '/d/gone.txt', mtime: 1, size: 1, hash: 'h1' }]))

    expect(diff.removed.map((f) => f.path)).toEqual(['/d/gone.txt'])
  })

  it('pairs a removed and an added path with the same hash into a move', () => {
    const diff = classify(
      [{ path: '/d/new/a.txt', mtime: 1, size: 1, hash: 'h1' }],
      stored([{ path: '/d/old/a.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.moved).toEqual([{ from: '/d/old/a.txt', to: '/d/new/a.txt', mtime: 1, size: 1, hash: 'h1' }])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })

  it('detects a rename in place as a move', () => {
    const diff = classify(
      [{ path: '/d/renamed.txt', mtime: 1, size: 1, hash: 'h1' }],
      stored([{ path: '/d/original.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.moved.map((m) => [m.from, m.to])).toEqual([['/d/original.txt', '/d/renamed.txt']])
  })

  it('pairs each removed path with only one added path when content is duplicated', () => {
    const diff = classify(
      [
        { path: '/d/copy1.txt', mtime: 1, size: 1, hash: 'h1' },
        { path: '/d/copy2.txt', mtime: 1, size: 1, hash: 'h1' },
      ],
      stored([{ path: '/d/orig.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.moved).toHaveLength(1)
    expect(diff.added).toHaveLength(1)
    expect(diff.removed).toEqual([])
  })

  it('keeps a file with no stored hash but matching mtime and size out of the work set', () => {
    const diff = classify(
      [{ path: '/d/a.txt', mtime: 1, size: 1, hash: 'h1' }],
      stored([{ path: '/d/a.txt', mtime: 1, size: 1, hash: null }]),
    )

    expect(diff.unchanged.map((f) => f.path)).toEqual(['/d/a.txt'])
    expect(diff.modified).toEqual([])
    expect(diff.metaRefresh.map((f) => f.path)).toEqual(['/d/a.txt'])
  })

  it('reports a file with no stored hash and a changed mtime as modified', () => {
    const diff = classify(
      [{ path: '/d/a.txt', mtime: 2, size: 1, hash: 'h1' }],
      stored([{ path: '/d/a.txt', mtime: 1, size: 1, hash: null }]),
    )

    expect(diff.modified.map((f) => f.path)).toEqual(['/d/a.txt'])
  })

  it('does not use a removed row without a stored hash as a move source', () => {
    const diff = classify(
      [{ path: '/d/new.txt', mtime: 1, size: 1, hash: 'h1' }],
      stored([{ path: '/d/old.txt', mtime: 1, size: 1, hash: null }]),
    )

    expect(diff.moved).toEqual([])
    expect(diff.added.map((f) => f.path)).toEqual(['/d/new.txt'])
    expect(diff.removed.map((f) => f.path)).toEqual(['/d/old.txt'])
  })

  it('falls back to mtime and size when the file on disk could not be hashed', () => {
    const diff = classify(
      [{ path: '/d/a.txt', mtime: 1, size: 1, hash: null }],
      stored([{ path: '/d/a.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.unchanged.map((f) => f.path)).toEqual(['/d/a.txt'])
  })

  it('does not use an unhashable file on disk as a move target', () => {
    const diff = classify(
      [{ path: '/d/new.txt', mtime: 1, size: 1, hash: null }],
      stored([{ path: '/d/old.txt', mtime: 1, size: 1, hash: 'h1' }]),
    )

    expect(diff.moved).toEqual([])
    expect(diff.added.map((f) => f.path)).toEqual(['/d/new.txt'])
  })

  it('separates added, modified, unchanged and removed in a single pass', () => {
    const diff = classify(
      [
        { path: '/d/keep.txt', mtime: 1, size: 1, hash: 'keep' },
        { path: '/d/edit.txt', mtime: 9, size: 9, hash: 'edit-new' },
        { path: '/d/fresh.txt', mtime: 1, size: 1, hash: 'fresh' },
      ],
      stored([
        { path: '/d/keep.txt', mtime: 1, size: 1, hash: 'keep' },
        { path: '/d/edit.txt', mtime: 1, size: 1, hash: 'edit-old' },
        { path: '/d/gone.txt', mtime: 1, size: 1, hash: 'gone' },
      ]),
    )

    expect(diff.unchanged.map((f) => f.path)).toEqual(['/d/keep.txt'])
    expect(diff.modified.map((f) => f.path)).toEqual(['/d/edit.txt'])
    expect(diff.added.map((f) => f.path)).toEqual(['/d/fresh.txt'])
    expect(diff.removed.map((f) => f.path)).toEqual(['/d/gone.txt'])
  })
})
