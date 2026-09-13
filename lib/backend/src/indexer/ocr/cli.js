/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import logger from '../../logger.js'

const execFileAsync = promisify(execFile)

/** Abort a single OCR call that takes unreasonably long. */
const OCR_TIMEOUT_MS = 60_000

/**
 * Extracts text from an image using the system Tesseract CLI.
 * Writes output to a temp file, reads it, then cleans up. Failures (missing
 * binary, unreadable image) degrade to an empty string so a single bad file
 * never aborts an indexing run.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted plain text, or empty string on failure.
 */
export async function recognize(filePath) {
  const outBase = join(tmpdir(), randomUUID())
  try {
    await execFileAsync('tesseract', [filePath, outBase, '-l', 'deu+eng'], { timeout: OCR_TIMEOUT_MS })
    return await readFile(`${outBase}.txt`, 'utf8')
  } catch (err) {
    logger.warn({ path: filePath, err: err?.message ?? err }, 'OCR failed, skipping file content')
    return ''
  } finally {
    await unlink(`${outBase}.txt`).catch(() => {})
  }
}
