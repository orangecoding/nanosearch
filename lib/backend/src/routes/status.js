/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getIndexStatus } from '../db/queries.js'

/**
 * Registers the GET /api/status route.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('better-sqlite3').Database }} options
 */
export default async function statusRoute(fastify, { db }) {
  fastify.get('/api/status', async () => {
    return getIndexStatus(db)
  })
}
