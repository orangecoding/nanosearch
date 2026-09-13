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
 * Worker options shared by the availability probe and the actual OCR calls.
 *
 * `errorHandler` is essential: without it tesseract.js rethrows worker errors
 * from inside its own message listener, which escapes every try/catch and
 * surfaces as an `uncaughtException` (see createWorker.js). With a handler
 * installed the error is only delivered through the rejected job promise.
 */
const WORKER_OPTIONS = {
  cachePath: CACHE_PATH,
  errorHandler: (err) => logger.debug({ err: err?.message ?? err }, 'Tesseract.js worker error'),
}

/**
 * Whether Tesseract.js successfully initialized this session.
 * null = not yet checked, true = available, false = unavailable.
 * @type {boolean | null}
 */
let ocrAvailable = null

/**
 * Resets the cached availability probe. Only used by tests.
 * @returns {void}
 */
export function resetAvailabilityCache() {
  ocrAvailable = null
}

/**
 * Creates a cancellable guard promise that rejects after the given delay.
 * Cancelling clears the timer so a finished OCR call does not keep the event
 * loop alive for the rest of the timeout window.
 * @param {number} ms - Delay in milliseconds.
 * @param {string} message - Rejection message.
 * @returns {{ promise: Promise<never>, cancel: () => void, done: boolean }}
 */
function timeout(ms, message) {
  /** @type {NodeJS.Timeout} */
  let handle
  const guard = {
    promise: new Promise((_, reject) => {
      handle = setTimeout(() => reject(new Error(message)), ms)
    }),
    cancel: () => clearTimeout(handle),
    done: false,
  }
  guard.promise.catch(() => {})
  return guard
}

/**
 * Checks once per session whether Tesseract.js can load language data.
 * If the check fails (missing data, network unreachable, timeout), all
 * subsequent image files are skipped rather than timing out one by one.
 * @returns {Promise<boolean>}
 */
async function checkAvailable() {
  if (ocrAvailable !== null) return ocrAvailable

  const guard = timeout(INIT_TIMEOUT_MS, 'Tesseract init timed out')
  try {
    const workerPromise = createWorker('deu+eng', 1, WORKER_OPTIONS)
    // A worker that only shows up after the timeout must still be terminated,
    // and its rejection must never bubble up as an unhandled rejection.
    workerPromise.then((w) => (guard.done ? w.terminate().catch(() => {}) : null)).catch(() => {})
    const worker = await Promise.race([workerPromise, guard.promise])
    await worker.terminate().catch(() => {})
    ocrAvailable = true
    logger.info('Tesseract.js OCR ready')
  } catch (err) {
    ocrAvailable = false
    logger.warn(
      { err: err?.message ?? err },
      'Tesseract.js OCR unavailable (language data missing or unreachable). ' +
        'Images will be skipped. Run with OCR_BACKEND=cli or place traineddata files in .tesseract-cache/',
    )
  } finally {
    guard.done = true
    guard.cancel()
  }

  return ocrAvailable
}

/**
 * Extracts text from an image using Tesseract.js (pure Node, no native deps).
 * Returns an empty string if OCR is not available this session or if the file
 * cannot be recognized, so a single bad file never aborts an indexing run.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted plain text, or empty string on failure.
 */
export async function recognize(filePath) {
  if (!(await checkAvailable())) return ''

  let worker
  const guard = timeout(OCR_TIMEOUT_MS, `OCR timed out after ${OCR_TIMEOUT_MS / 1000}s`)
  try {
    worker = await createWorker('deu+eng', 1, WORKER_OPTIONS)
    const job = worker.recognize(filePath)
    // Swallow a late rejection of the losing promise: Promise.race leaves it
    // unhandled, which would trigger an `unhandledRejection` after a timeout.
    job.catch(() => {})
    const {
      data: { text },
    } = await Promise.race([job, guard.promise])
    return text ?? ''
  } catch (err) {
    logger.warn({ path: filePath, err: err?.message ?? err }, 'OCR failed, skipping file content')
    return ''
  } finally {
    guard.done = true
    guard.cancel()
    if (worker) await worker.terminate().catch(() => {})
  }
}
