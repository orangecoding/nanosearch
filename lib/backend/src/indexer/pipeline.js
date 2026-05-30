/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { scanDirectory } from './scanner.js'
import { extractFile } from './extractor.js'
import { upsertFile, deleteFile, getAllPaths, getAllFileMeta } from '../db/queries.js'
import { getSubscribers } from './state.js'
import logger from '../logger.js'

/**
 * Runs an incremental indexing pass over the configured directories.
 * Streams SSE progress events to all connected clients as each file is processed.
 * ETA is calculated as a running average starting from the 4th file.
 * @param {{ db: import('better-sqlite3').Database, dirs: string[] }} options
 * @returns {Promise<number>} Total number of files found (not just indexed).
 */
export async function runIndexing({ db, dirs }) {
  const allFiles = (await Promise.all(dirs.map(scanDirectory))).flat()
  const total = allFiles.length
  let processed = 0
  const startTime = Date.now()

  try {
    // Load all stored metadata in one query for O(1) per-file change detection.
    const storedMeta = getAllFileMeta(db)

    // Remove DB entries for files no longer on disk
    const currentPaths = new Set(allFiles.map((f) => f.path))
    for (const dbPath of getAllPaths(db)) {
      if (!currentPaths.has(dbPath)) {
        deleteFile(db, dbPath)
        logger.info({ path: dbPath }, 'Removed deleted file from index')
      }
    }

    for (const file of allFiles) {
      // Only (re-)index files that are new or have changed. A file is
      // considered unchanged when both its modification time and size match
      // what we already have stored; otherwise it is treated as changed.
      const stored = storedMeta.get(file.path)
      if (stored && stored.mtime === file.mtime && stored.size === file.size) {
        processed++
        broadcast({ file: file.path.split('/').pop(), processed, total, percent: pct(processed, total), eta: -1 })
        continue
      }

      try {
        const { content, type } = await extractFile(file.path)
        upsertFile(db, { ...file, type, content })
      } catch (err) {
        logger.warn({ path: file.path, err }, 'Failed to extract file, skipping')
      }

      processed++
      const elapsed = Date.now() - startTime
      const avgMs = elapsed / processed
      const eta = processed > 3 ? Math.round(((total - processed) * avgMs) / 1000) : -1
      broadcast({ file: file.path.split('/').pop(), processed, total, percent: pct(processed, total), eta })
    }
  } finally {
    // Always notify the frontend that indexing finished, even if an error escaped.
    broadcast({ done: true, fileCount: processed })
  }

  return total
}

/**
 * @param {number} n
 * @param {number} total
 * @returns {number}
 */
function pct(n, total) {
  return total === 0 ? 100 : Math.round((n / total) * 100)
}

/**
 * Sends an SSE event to all connected subscribers.
 * @param {object} event
 */
function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const res of getSubscribers()) {
    try {
      res.write(data)
    } catch {
      // Client already disconnected - ignore
    }
  }
}
