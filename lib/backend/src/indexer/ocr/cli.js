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
import { OcrUnavailableError } from './unavailable.js'

const execFileAsync = promisify(execFile)

/** Abort a single OCR call that takes unreasonably long. */
const OCR_TIMEOUT_MS = 60_000

/**
 * Extracts text from an image using the system Tesseract CLI.
 * Writes output to a temp file, reads it, then cleans up. A file Tesseract
 * cannot read degrades to an empty string so a single bad file never aborts an
 * indexing run. A missing binary is different: it throws, so the file stays
 * unindexed and is retried once Tesseract is installed.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted plain text, or empty string on failure.
 * @throws {OcrUnavailableError} When the tesseract binary is not installed.
 */
export async function recognize(filePath) {
  const outBase = join(tmpdir(), randomUUID())
  try {
    await execFileAsync('tesseract', [filePath, outBase, '-l', 'deu+eng'], { timeout: OCR_TIMEOUT_MS })
    return await readFile(`${outBase}.txt`, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') throw new OcrUnavailableError('tesseract binary not found')
    logger.warn({ path: filePath, err: err?.message ?? err }, 'OCR failed, skipping file content')
    return ''
  } finally {
    await unlink(`${outBase}.txt`).catch(() => {})
  }
}
