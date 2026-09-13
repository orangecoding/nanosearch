/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { scanDirectory } from './scanner.js'
import { extractFile } from './extractor.js'
import { classify } from './diff.js'
import { upsertFile, deleteFile, renameFile, refreshFileMeta, getAllFileMeta } from '../db/queries.js'
import { getSubscribers } from './state.js'
import logger from '../logger.js'

/**
 * Runs an incremental indexing pass over the configured directories.
 *
 * The run diffs the scanned files against the index first and only extracts the
 * files that are genuinely new or edited. Deletions, moves and metadata drift
 * are applied as plain database writes, so a scan over an unchanged corpus does
 * no extraction work at all. Progress is reported over that dirty subset rather
 * than over every file on disk.
 *
 * @param {{ db: import('better-sqlite3').Database, dirs: string[] }} options
 * @returns {Promise<{ scanned: number, unchanged: number, added: number, modified: number, moved: number, removed: number, indexed: number, failed: number }>}
 */
export async function runIndexing({ db, dirs }) {
  const allFiles = (await Promise.all(dirs.map(scanDirectory))).flat()
  const diff = classify(allFiles, getAllFileMeta(db))

  applyStructuralChanges(db, diff)

  // Only new and edited files need extraction; everything else was already
  // handled above without reading a single document.
  const dirty = [...diff.added, ...diff.modified]
  const total = dirty.length
  let processed = 0
  let failed = 0
  const startTime = Date.now()

  broadcast({
    summary: true,
    scanned: allFiles.length,
    unchanged: diff.unchanged.length,
    added: diff.added.length,
    modified: diff.modified.length,
    moved: diff.moved.length,
    removed: diff.removed.length,
    total,
  })

  try {
    for (const file of dirty) {
      try {
        const { content, type } = await extractFile(file.path)
        upsertFile(db, { ...file, type, content })
      } catch (err) {
        failed++
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

  return {
    scanned: allFiles.length,
    unchanged: diff.unchanged.length,
    added: diff.added.length,
    modified: diff.modified.length,
    moved: diff.moved.length,
    removed: diff.removed.length,
    indexed: processed - failed,
    failed,
  }
}

/**
 * Applies every change that does not require reading a document: deleting files
 * that are gone, moving files that only changed path, and writing back metadata
 * for files whose content is unchanged.
 * @param {import('better-sqlite3').Database} db
 * @param {ReturnType<typeof classify>} diff
 */
function applyStructuralChanges(db, diff) {
  for (const file of diff.removed) {
    deleteFile(db, file.path)
    logger.info({ path: file.path }, 'Removed deleted file from index')
  }

  for (const move of diff.moved) {
    renameFile(db, move)
    logger.info({ from: move.from, to: move.to }, 'Moved file in index without re-extracting')
  }

  for (const file of diff.metaRefresh) {
    refreshFileMeta(db, file)
  }
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
