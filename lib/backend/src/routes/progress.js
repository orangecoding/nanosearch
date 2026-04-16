/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSubscribers } from '../indexer/state.js'

/**
 * Registers the GET /api/index/progress SSE route.
 * Adds the response stream to the subscriber set so the pipeline can broadcast events.
 * Removes it when the client disconnects.
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function progressRoute(fastify) {
  fastify.get('/api/index/progress', (request, reply) => {
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('\n')

    const subs = getSubscribers()
    subs.add(res)

    request.raw.on('close', () => subs.delete(res))
  })
}
