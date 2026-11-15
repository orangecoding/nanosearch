/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname } from 'node:path'
import logger from '../logger.js'
import { config } from '../config.js'

/**
 * File extensions to index, driven entirely by the EXTENSIONS env variable.
 * No defaults are baked in - if it is not in the env, it is not indexed.
 */
const SUPPORTED = new Set(config.extensions)

/**
 * How many files are hashed at the same time. The directory walk already fans
 * out with an unbounded Promise.all, so hashing runs as a separate bounded pass
 * to keep the number of open file descriptors under control on large trees.
 */
const HASH_CONCURRENCY = 8

/**
 * Recursively scans a directory and returns all supported files, each with a
 * content hash. The hash is what lets the indexer tell a genuinely edited file
 * apart from one that merely had its mtime bumped, and lets it recognise a
 * moved file by its content instead of re-extracting it.
 *
 * Reading every byte of the corpus on each scan would be the most expensive
 * part of a run, so a file whose mtime and size still match the index reuses
 * its stored hash and is not read at all.
 * @param {string} dir - Absolute path to the directory to scan.
 * @param {object} [options]
 * @param {Map<string, { mtime: number, size: number, hash: string | null }>} [options.storedMeta]
 *   Indexed metadata by path. Without it every file is hashed.
 * @param {string[]} [options.unreadable] - Receives every directory that could
 *   not be listed, so the caller does not mistake its files for deleted ones.
 * @returns {Promise<Array<{ path: string, mtime: number, size: number, hash: string | null }>>}
 */
export async function scanDirectory(dir, { storedMeta, unreadable = [] } = {}) {
  const results = []
  await walk(dir, results, unreadable)
  await hashAll(results, storedMeta)
  return results
}

/**
 * Fills in the hash of every scanned file in place, reading at most
 * HASH_CONCURRENCY files at a time and none whose mtime and size are unchanged.
 * @param {Array<{ path: string, mtime: number, size: number, hash?: string | null }>} files
 * @param {Map<string, { mtime: number, size: number, hash: string | null }>} [storedMeta]
 * @returns {Promise<void>}
 */
async function hashAll(files, storedMeta) {
  let next = 0
  const workers = Array.from({ length: Math.min(HASH_CONCURRENCY, files.length) }, async () => {
    while (next < files.length) {
      const file = files[next++]
      const stored = storedMeta?.get(file.path)
      const untouched = stored?.hash != null && stored.mtime === file.mtime && stored.size === file.size
      file.hash = untouched ? stored.hash : await hashFile(file.path)
    }
  })
  await Promise.all(workers)
}

/**
 * Streams a file through sha1. Used to detect content changes, not for
 * security, so collision resistance is not a requirement here.
 * @param {string} path
 * @returns {Promise<string | null>} Hex digest, or null if the file is unreadable.
 */
function hashFile(path) {
  return new Promise((resolve) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', (err) => {
      logger.warn({ path, code: err.code }, 'Cannot hash file, falling back to mtime and size')
      resolve(null)
    })
  })
}

/**
 * @param {string} dir
 * @param {Array<{ path: string, mtime: number, size: number }>} results
 * @param {string[]} unreadable
 */
async function walk(dir, results, unreadable) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    logger.warn({ path: dir, code: err.code }, 'Cannot read directory, skipping')
    unreadable.push(dir)
    return
  }

  await Promise.all(
    entries.map(async (entry) => {
      // Skip hidden directories (names starting with .)
      if (entry.isDirectory() && entry.name.startsWith('.')) return

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, results, unreadable)
      } else if (entry.isFile() && SUPPORTED.has(extname(entry.name).toLowerCase())) {
        try {
          const s = await stat(fullPath)
          results.push({ path: fullPath, mtime: s.mtimeMs, size: s.size })
        } catch (err) {
          logger.warn({ path: fullPath, code: err.code }, 'Cannot stat file, skipping')
        }
      }
    }),
  )
}
