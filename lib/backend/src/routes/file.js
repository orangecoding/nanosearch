/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { getFileMtime } from '../db/queries.js'

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
}

/**
 * Registers the GET /api/file route.
 * Serves a raw file by path, only if the path exists in the index (security gate).
 * Content-Type is derived from the file extension.
 * Returns 400 for missing path, 404 for unknown/missing files.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('better-sqlite3').Database }} options
 */
export default async function fileRoute(fastify, { db }) {
  fastify.get('/api/file', async (request, reply) => {
    const { path } = request.query
    if (!path) return reply.code(400).send({ error: 'Missing path' })

    // Security: only serve files that are tracked in the index
    const mtime = getFileMtime(db, path)
    if (mtime === null) return reply.code(404).send({ error: 'Not in index' })

    try {
      const data = await readFile(path)
      const ext = extname(path).toLowerCase()
      const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
      return reply.header('Content-Type', contentType).send(data)
    } catch {
      return reply.code(404).send({ error: 'File not found on disk' })
    }
  })
}
