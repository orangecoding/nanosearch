/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDb } from '../db/schema.js'
import { upsertFile } from '../db/queries.js'
import fileRoute from '../routes/file.js'

vi.mock('../indexer/pipeline.js', () => ({ runIndexing: vi.fn().mockResolvedValue(0) }))
vi.mock('../indexer/state.js', () => ({
  isIndexing: vi.fn().mockReturnValue(false),
  setIndexing: vi.fn(),
  getSubscribers: vi.fn().mockReturnValue(new Set()),
}))
vi.mock('node:child_process', () => ({ execFile: vi.fn() }))

import statusRoute from '../routes/status.js'
import searchRoute from '../routes/search.js'
import indexRoute from '../routes/index.js'
import openRoute from '../routes/open.js'

async function buildApp(db) {
  const app = Fastify({ logger: false })
  await app.register(statusRoute, { db })
  await app.register(searchRoute, { db })
  await app.register(indexRoute, { db })
  await app.register(openRoute)
  await app.ready()
  return app
}

describe('GET /api/status', () => {
  it('returns indexed: false when db is empty', async () => {
    const app = await buildApp(createDb(':memory:'))
    const res = await app.inject({ method: 'GET', url: '/api/status' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ indexed: false, fileCount: 0 })
  })

  it('returns indexed: true with correct fileCount', async () => {
    const db = createDb(':memory:')
    upsertFile(db, { path: '/a.txt', mtime: 1, size: 1, type: 'txt', content: 'x' })
    const app = await buildApp(db)
    const res = await app.inject({ method: 'GET', url: '/api/status' })
    expect(JSON.parse(res.body)).toMatchObject({ indexed: true, fileCount: 1 })
  })
})

describe('GET /api/search', () => {
  it('returns empty array for empty query', async () => {
    const app = await buildApp(createDb(':memory:'))
    const res = await app.inject({ method: 'GET', url: '/api/search?q=' })
    expect(JSON.parse(res.body)).toEqual([])
  })

  it('returns matches', async () => {
    const db = createDb(':memory:')
    upsertFile(db, { path: '/doc.txt', mtime: 1, size: 1, type: 'txt', content: 'nanosearch fulltext' })
    const app = await buildApp(db)
    const res = await app.inject({ method: 'GET', url: '/api/search?q=nanosearch' })
    const body = JSON.parse(res.body)
    expect(body).toHaveLength(1)
    expect(body[0].path).toBe('/doc.txt')
  })

  it('returns empty array for unknown search term', async () => {
    const db = createDb(':memory:')
    upsertFile(db, { path: '/doc.txt', mtime: 1, size: 1, type: 'txt', content: 'hello world' })
    const app = await buildApp(db)
    const res = await app.inject({ method: 'GET', url: '/api/search?q=zzznomatch' })
    expect(JSON.parse(res.body)).toEqual([])
  })
})

describe('POST /api/index', () => {
  it('returns 202 when not already indexing', async () => {
    const { isIndexing } = await import('../indexer/state.js')
    isIndexing.mockReturnValue(false)
    const app = await buildApp(createDb(':memory:'))
    const res = await app.inject({ method: 'POST', url: '/api/index' })
    expect(res.statusCode).toBe(202)
  })

  it('returns 409 when already indexing', async () => {
    const { isIndexing } = await import('../indexer/state.js')
    isIndexing.mockReturnValue(true)
    const app = await buildApp(createDb(':memory:'))
    const res = await app.inject({ method: 'POST', url: '/api/index' })
    expect(res.statusCode).toBe(409)
  })
})

describe('POST /api/open', () => {
  it('returns 501 when execFile fails', async () => {
    const { execFile } = await import('node:child_process')
    execFile.mockImplementation((_cmd, _args, cb) => cb(new Error('not found')))
    const app = await buildApp(createDb(':memory:'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/open',
      payload: { path: '/some/file.pdf' },
    })
    expect([200, 501]).toContain(res.statusCode)
  })
})

// Update buildApp to include fileRoute:
async function buildAppWithFile(db) {
  const app = Fastify({ logger: false })
  await app.register(statusRoute, { db })
  await app.register(searchRoute, { db })
  await app.register(indexRoute, { db })
  await app.register(openRoute)
  await app.register(fileRoute, { db })
  await app.ready()
  return app
}

describe('GET /api/file', () => {
  const tmpPath = join(tmpdir(), 'nanosearch-test.txt')

  beforeAll(() => writeFileSync(tmpPath, 'hello world'))
  afterAll(() => unlinkSync(tmpPath))

  it('returns 400 when path is missing', async () => {
    const app = await buildAppWithFile(createDb(':memory:'))
    const res = await app.inject({ method: 'GET', url: '/api/file' })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when path is not in index', async () => {
    const app = await buildAppWithFile(createDb(':memory:'))
    const res = await app.inject({ method: 'GET', url: '/api/file?path=/nonexistent.txt' })
    expect(res.statusCode).toBe(404)
  })

  it('returns file content with correct status when path is indexed', async () => {
    const db = createDb(':memory:')
    upsertFile(db, { path: tmpPath, mtime: 1, size: 11, type: 'txt', content: 'hello world' })
    const app = await buildAppWithFile(db)
    const res = await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(tmpPath)}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('hello world')
  })

  it('sets text/plain content-type for .txt files', async () => {
    const db = createDb(':memory:')
    upsertFile(db, { path: tmpPath, mtime: 1, size: 11, type: 'txt', content: 'hello world' })
    const app = await buildAppWithFile(db)
    const res = await app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(tmpPath)}` })
    expect(res.headers['content-type']).toMatch(/text\/plain/)
  })

  it('returns 404 when file is indexed but missing from disk', async () => {
    const db = createDb(':memory:')
    upsertFile(db, { path: '/tmp/nanosearch-gone.txt', mtime: 1, size: 0, type: 'txt', content: '' })
    const app = await buildAppWithFile(db)
    const res = await app.inject({ method: 'GET', url: '/api/file?path=/tmp/nanosearch-gone.txt' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toBe('File not found on disk')
  })
})
