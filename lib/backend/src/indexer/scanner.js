/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import logger from '../logger.js'
import { config } from '../config.js'

/**
 * File extensions to index, driven entirely by the EXTENSIONS env variable.
 * No defaults are baked in - if it is not in the env, it is not indexed.
 */
const SUPPORTED = new Set(config.extensions)

/**
 * Recursively scans a directory and returns all supported files.
 * @param {string} dir - Absolute path to the directory to scan.
 * @returns {Promise<Array<{ path: string, mtime: number, size: number }>>}
 */
export async function scanDirectory(dir) {
  const results = []
  await walk(dir, results)
  return results
}

/**
 * @param {string} dir
 * @param {Array<{ path: string, mtime: number, size: number }>} results
 */
async function walk(dir, results) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    logger.warn({ path: dir, code: err.code }, 'Cannot read directory, skipping')
    return
  }

  await Promise.all(
    entries.map(async (entry) => {
      // Skip hidden directories (names starting with .)
      if (entry.isDirectory() && entry.name.startsWith('.')) return

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, results)
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
