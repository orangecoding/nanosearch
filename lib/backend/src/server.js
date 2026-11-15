/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import chalk from 'chalk'
import { config } from './config.js'
import logger from './logger.js'
import { createDb } from './db/schema.js'
import { startRescanScheduler } from './indexer/scheduler.js'
import statusRoute from './routes/status.js'
import searchRoute from './routes/search.js'
import indexRoute from './routes/index.js'
import progressRoute from './routes/progress.js'
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

/**
 * Content Security Policy for the app shell. Search snippets and rendered
 * Markdown come from indexed documents, i.e. from untrusted content. They are
 * escaped before they reach the page, and this policy is the second line of
 * defense: inline scripts, event handlers and javascript: URLs do not run, and
 * nothing can be loaded from or submitted to another origin.
 */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "object-src 'self'",
  "frame-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

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

// No CORS on purpose: the frontend is served from this origin (or through the
// Vite proxy in development), so other websites get no access to the API.
await fastify.register(statusRoute, { db })
await fastify.register(searchRoute, { db })
await fastify.register(indexRoute, { db })
await fastify.register(progressRoute)
await fastify.register(fileRoute, { db })

if (process.env.NODE_ENV === 'production') {
  await fastify.register(staticPlugin, {
    root: join(__dirname, '../../../lib/frontend/dist'),
    prefix: '/',
    setHeaders(res, path) {
      if (path.endsWith('.html')) res.setHeader('Content-Security-Policy', APP_CSP)
    },
  })
}

await fastify.listen({ port: config.port, host: config.host })

// Start the periodic re-scan timer. Disabled when RESCAN_INTERVAL_HOURS=0.
startRescanScheduler({ db, dirs: config.searchDirs, intervalHours: config.rescanIntervalHours })

// eslint-disable-next-line no-console
console.log(chalk.green(`nanosearch listening on http://${config.host}:${config.port}`))
