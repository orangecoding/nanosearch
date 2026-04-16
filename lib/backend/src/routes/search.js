/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { search } from '../db/queries.js'

/**
 * Registers the GET /api/search route.
 * Returns up to 30 BM25-ranked FTS5 results for the given query.
 * Returns an empty array for empty or missing queries.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('better-sqlite3').Database }} options
 */
export default async function searchRoute(fastify, { db }) {
  fastify.get('/api/search', async (request) => {
    const { q, exact, raw } = request.query
    if (!q || q.trim().length === 0) return []
    try {
      return search(db, q, exact === 'true', raw === 'true')
    } catch {
      return []
    }
  })
}
