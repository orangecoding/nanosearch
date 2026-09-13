/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db/schema.js'
import {
  upsertFile,
  deleteFile,
  renameFile,
  refreshFileMeta,
  getFileMtime,
  getFileHash,
  getAllFileMeta,
  getAllPaths,
  search,
  getIndexStatus,
} from '../db/queries.js'

describe('database', () => {
  let db

  beforeEach(() => {
    db = createDb(':memory:')
  })

  describe('upsertFile', () => {
    it('inserts a file and makes it searchable', () => {
      upsertFile(db, { path: '/docs/hello.txt', mtime: 1000, size: 100, type: 'txt', content: 'hello foobar' })
      const results = search(db, 'foobar')
      expect(results).toHaveLength(1)
      expect(results[0].path).toBe('/docs/hello.txt')
      expect(results[0].filename).toBe('hello.txt')
      expect(results[0].type).toBe('txt')
    })

    it('updates content and mtime on re-insert', () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1000, size: 10, type: 'txt', content: 'old term' })
      upsertFile(db, { path: '/docs/a.txt', mtime: 2000, size: 20, type: 'txt', content: 'new content' })
      expect(getFileMtime(db, '/docs/a.txt')).toBe(2000)
      expect(search(db, 'content')).toHaveLength(1)
      expect(search(db, 'old')).toHaveLength(0)
    })
  })

  describe('hash column', () => {
    it('stores the content hash of an upserted file', () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1, size: 1, type: 'txt', content: 'x', hash: 'abc' })
      expect(getFileHash(db, '/docs/a.txt')).toBe('abc')
    })

    it('leaves the hash null when a file is upserted without one', () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1, size: 1, type: 'txt', content: 'x' })
      expect(getFileHash(db, '/docs/a.txt')).toBeNull()
    })

    it('exposes mtime, size and hash through getAllFileMeta', () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 7, size: 8, type: 'txt', content: 'x', hash: 'abc' })
      expect(getAllFileMeta(db).get('/docs/a.txt')).toEqual({ mtime: 7, size: 8, hash: 'abc' })
    })
  })

  describe('renameFile', () => {
    it('moves a file to a new path and keeps its content searchable', () => {
      upsertFile(db, { path: '/old/a.txt', mtime: 1, size: 1, type: 'pdf', content: 'findme', hash: 'h1' })

      renameFile(db, { from: '/old/a.txt', to: '/new/a.txt', mtime: 2, size: 1, hash: 'h1' })

      expect(getAllPaths(db)).toEqual(['/new/a.txt'])
      expect(search(db, 'findme')[0].path).toBe('/new/a.txt')
      expect(getFileMtime(db, '/new/a.txt')).toBe(2)
    })

    it('keeps the file type of the moved row', () => {
      upsertFile(db, { path: '/old/a.txt', mtime: 1, size: 1, type: 'pdf', content: 'findme', hash: 'h1' })

      renameFile(db, { from: '/old/a.txt', to: '/new/a.txt', mtime: 1, size: 1, hash: 'h1' })

      expect(search(db, 'findme')[0].type).toBe('pdf')
    })

    it('replaces a stale row when the move overwrites an indexed file', () => {
      upsertFile(db, { path: '/src.txt', mtime: 1, size: 1, type: 'txt', content: 'source', hash: 'h1' })
      upsertFile(db, { path: '/dest.txt', mtime: 1, size: 1, type: 'txt', content: 'overwritten', hash: 'h2' })

      renameFile(db, { from: '/src.txt', to: '/dest.txt', mtime: 1, size: 1, hash: 'h1' })

      expect(getAllPaths(db)).toEqual(['/dest.txt'])
      expect(search(db, 'source')).toHaveLength(1)
      expect(search(db, 'overwritten')).toHaveLength(0)
    })
  })

  describe('refreshFileMeta', () => {
    it('updates metadata without touching the indexed content', () => {
      upsertFile(db, { path: '/docs/a.txt', mtime: 1, size: 1, type: 'txt', content: 'keepme' })

      refreshFileMeta(db, { path: '/docs/a.txt', mtime: 42, size: 99, hash: 'h1' })

      expect(getFileMtime(db, '/docs/a.txt')).toBe(42)
      expect(getFileHash(db, '/docs/a.txt')).toBe('h1')
      expect(search(db, 'keepme')).toHaveLength(1)
    })
  })

  describe('deleteFile', () => {
    it('removes file and FTS content', () => {
      upsertFile(db, { path: '/docs/del.txt', mtime: 1, size: 1, type: 'txt', content: 'deleteme' })
      deleteFile(db, '/docs/del.txt')
      expect(getFileMtime(db, '/docs/del.txt')).toBeNull()
      expect(search(db, 'deleteme')).toHaveLength(0)
    })
  })

  describe('getFileMtime', () => {
    it('returns null for unknown path', () => {
      expect(getFileMtime(db, '/nope')).toBeNull()
    })

    it('returns stored mtime', () => {
      upsertFile(db, { path: '/x.txt', mtime: 9999, size: 1, type: 'txt', content: '' })
      expect(getFileMtime(db, '/x.txt')).toBe(9999)
    })
  })

  describe('getAllPaths', () => {
    it('returns all indexed paths', () => {
      upsertFile(db, { path: '/a.txt', mtime: 1, size: 1, type: 'txt', content: '' })
      upsertFile(db, { path: '/b.txt', mtime: 1, size: 1, type: 'txt', content: '' })
      expect(getAllPaths(db).sort()).toEqual(['/a.txt', '/b.txt'])
    })
  })

  describe('getIndexStatus', () => {
    it('returns indexed: false when empty', () => {
      expect(getIndexStatus(db)).toMatchObject({ indexed: false, fileCount: 0 })
    })

    it('returns correct count', () => {
      upsertFile(db, { path: '/a.txt', mtime: 1, size: 1, type: 'txt', content: '' })
      upsertFile(db, { path: '/b.txt', mtime: 1, size: 1, type: 'txt', content: '' })
      expect(getIndexStatus(db)).toMatchObject({ indexed: true, fileCount: 2 })
    })
  })

  describe('search', () => {
    it('returns empty array for no matches', () => {
      expect(search(db, 'xyz')).toEqual([])
    })

    it('caps results at 15', () => {
      for (let i = 0; i < 20; i++) {
        upsertFile(db, { path: `/f${i}.txt`, mtime: 1, size: 1, type: 'txt', content: 'searchterm repeated' })
      }
      expect(search(db, 'searchterm')).toHaveLength(15)
    })

    it('includes snippet with mark tags', () => {
      upsertFile(db, { path: '/doc.txt', mtime: 1, size: 1, type: 'txt', content: 'the quick brown fox' })
      const results = search(db, 'quick')
      expect(results[0].snippet).toContain('<mark>')
    })
  })
})
