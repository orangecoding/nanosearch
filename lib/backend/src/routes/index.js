/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isIndexing, setIndexing } from '../indexer/state.js'
import { runIndexing } from '../indexer/pipeline.js'
import { clearIndex } from '../db/queries.js'
import { config } from '../config.js'
import logger from '../logger.js'

/**
 * Registers the POST /api/index route.
 * Accepts an optional JSON body: { full: boolean }
 * - full=false (default): incremental - skips unchanged files
 * - full=true: clears the entire index first, then re-indexes everything
 * Returns 202 when indexing starts, 409 if already running.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ db: import('better-sqlite3').Database }} options
 */
export default async function indexRoute(fastify, { db }) {
  fastify.post('/api/index', async (request, reply) => {
    if (isIndexing()) {
      return reply.code(409).send({ error: 'Indexing already in progress' })
    }

    const { full = false } = request.body ?? {}

    if (full) {
      clearIndex(db)
      logger.info('Full re-index requested - existing index cleared')
    }

    setIndexing(true)
    reply.code(202).send({ started: true })

    runIndexing({ db, dirs: config.searchDirs })
      .then((count) => logger.info({ count }, 'Indexing complete'))
      .catch((err) => logger.error({ err }, 'Indexing failed'))
      .finally(() => setIndexing(false))
  })
}
