/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { config as loadEnv } from 'dotenv'
import { dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const __rootDir = join(dirname(fileURLToPath(import.meta.url)), '../../..')

// Load .env as defaults only — do not override vars already set in the environment
// (e.g. by docker-compose or the shell), so deployment config always wins.
loadEnv({ path: join(__rootDir, '.env') })

/**
 * Resolves a path against the project root so that relative paths in .env
 * (e.g. ./db/nanosearch.db) always resolve from the repo root, not from
 * the process cwd (which varies depending on where node is started from).
 * @param {string} p
 * @returns {string}
 */
function fromRoot(p) {
  return isAbsolute(p) ? p : join(__rootDir, p)
}

/**
 * Application configuration loaded from environment variables.
 */
export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  dbPath: fromRoot(process.env.DB_PATH ?? './db/nanosearch.db'),
  searchDirs: (process.env.SEARCH_DIRS ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean),
  ocrBackend: process.env.OCR_BACKEND ?? 'js',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  extensions: (process.env.EXTENSIONS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .map((e) => (e.startsWith('.') ? e : `.${e}`)),
}
