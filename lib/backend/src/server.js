/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import chalk from 'chalk'
import { config } from './config.js'
import logger from './logger.js'
import { createDb } from './db/schema.js'
import statusRoute from './routes/status.js'
import searchRoute from './routes/search.js'
import indexRoute from './routes/index.js'
import progressRoute from './routes/progress.js'
import openRoute from './routes/open.js'
import fileRoute from './routes/file.js'

// Prevent OCR worker errors or other internal exceptions from crashing the process.
// Errors during indexing are already caught per-file in the pipeline, but Tesseract.js
// can throw synchronously from within a worker context in rare cases.
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception - continuing')
})
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection - continuing')
})

const __dirname = dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: {
    level: config.logLevel,
    ...(process.env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    }),
  },
})

const db = createDb(config.dbPath)

await fastify.register(cors, { origin: true })
await fastify.register(statusRoute, { db })
await fastify.register(searchRoute, { db })
await fastify.register(indexRoute, { db })
await fastify.register(progressRoute)
await fastify.register(openRoute)
await fastify.register(fileRoute, { db })

if (process.env.NODE_ENV === 'production') {
  await fastify.register(staticPlugin, {
    root: join(__dirname, '../../../lib/frontend/dist'),
    prefix: '/',
  })
}

await fastify.listen({ port: config.port, host: '0.0.0.0' })

// eslint-disable-next-line no-console
console.log(chalk.green(`nanosearch listening on http://localhost:${config.port}`))
