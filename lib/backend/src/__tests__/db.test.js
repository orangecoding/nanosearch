/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../db/schema.js'
import { upsertFile, deleteFile, getFileMtime, getAllPaths, search, getIndexStatus } from '../db/queries.js'

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
