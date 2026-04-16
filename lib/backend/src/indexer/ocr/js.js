/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { createWorker } from 'tesseract.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import logger from '../../logger.js'

/**
 * cachePath tells Tesseract.js where to store downloaded language data.
 * langPath (not used here) would mean "read from here only, no download".
 */
const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../../../.tesseract-cache')

/** How long to wait for the language data check or a single OCR call. */
const INIT_TIMEOUT_MS = 15_000
const OCR_TIMEOUT_MS = 30_000

await mkdir(CACHE_PATH, { recursive: true })

/**
 * Whether Tesseract.js successfully initialized this session.
 * null = not yet checked, true = available, false = unavailable.
 * @type {boolean | null}
 */
let ocrAvailable = null

/**
 * Checks once per session whether Tesseract.js can load language data.
 * If the check fails (missing data, network unreachable, timeout), all
 * subsequent image files are skipped rather than timing out one by one.
 * @returns {Promise<boolean>}
 */
async function checkAvailable() {
  if (ocrAvailable !== null) return ocrAvailable

  try {
    const worker = await Promise.race([
      createWorker('deu+eng', 1, { cachePath: CACHE_PATH }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tesseract init timed out')), INIT_TIMEOUT_MS)),
    ])
    await worker.terminate().catch(() => {})
    ocrAvailable = true
    logger.info('Tesseract.js OCR ready')
  } catch (err) {
    ocrAvailable = false
    logger.warn(
      { err },
      'Tesseract.js OCR unavailable (language data missing or unreachable). ' +
        'Images will be skipped. Run with OCR_BACKEND=cli or place traineddata files in .tesseract-cache/',
    )
  }

  return ocrAvailable
}

/**
 * Extracts text from an image using Tesseract.js (pure Node, no native deps).
 * Returns an empty string immediately if OCR is not available this session.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted plain text, or empty string on failure.
 */
export async function recognize(filePath) {
  if (!(await checkAvailable())) return ''

  const worker = await createWorker('deu+eng', 1, { cachePath: CACHE_PATH })
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`OCR timed out after ${OCR_TIMEOUT_MS / 1000}s`)), OCR_TIMEOUT_MS),
    )
    const {
      data: { text },
    } = await Promise.race([worker.recognize(filePath), timeout])
    return text
  } finally {
    await worker.terminate().catch(() => {})
  }
}
