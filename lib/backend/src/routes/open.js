/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { platform } from 'node:os'

const execFileAsync = promisify(execFile)

/**
 * Registers the POST /api/open route.
 * Opens the given file path in the system file manager.
 * macOS: open -R <path> (reveals in Finder)
 * Windows: explorer /select,<path>
 * Other platforms: returns 501 so the frontend can display the raw path.
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function openRoute(fastify) {
  fastify.post('/api/open', async (request, reply) => {
    const { path } = request.body
    const os = platform()

    try {
      if (os === 'darwin') {
        await execFileAsync('open', ['-R', path])
        return { opened: true }
      }
      if (os === 'win32') {
        await execFileAsync('explorer', [`/select,${path}`])
        return { opened: true }
      }
      return reply.code(501).send({ error: 'Unsupported platform' })
    } catch {
      return reply.code(501).send({ error: 'Failed to open file' })
    }
  })
}
