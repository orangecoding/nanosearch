/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { createWorker } from 'tesseract.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import logger from '../../logger.js'
import { OcrUnavailableError } from './unavailable.js'

/**
 * cachePath tells Tesseract.js where to store downloaded language data.
 * langPath (not used here) would mean "read from here only, no download".
 */
const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../../../.tesseract-cache')

/** How long to wait for the language data check or a single OCR call. */
const INIT_TIMEOUT_MS = 15_000
const OCR_TIMEOUT_MS = 30_000

/** Shut the shared worker down once no image has been processed for this long. */
const IDLE_RELEASE_MS = 30_000

await mkdir(CACHE_PATH, { recursive: true })

/**
 * Options for the shared OCR worker.
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
 * The worker shared by all OCR calls. Starting one loads both language models,
 * which costs far more than recognizing a page, so it is kept between calls
 * and only released after a period of inactivity.
 * @type {import('tesseract.js').Worker | null}
 */
let worker = null

/** @type {NodeJS.Timeout | undefined} */
let idleTimer

/**
 * Resets the cached availability probe and worker. Only used by tests.
 * @returns {void}
 */
export function resetAvailabilityCache() {
  ocrAvailable = null
  worker = null
  clearTimeout(idleTimer)
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
 * Terminates the shared worker, if any.
 * @returns {Promise<void>}
 */
async function releaseWorker() {
  const current = worker
  worker = null
  if (current) await current.terminate().catch(() => {})
}

/**
 * Returns the shared worker, starting it when needed. The first start doubles
 * as the availability check: if it fails (missing language data, network
 * unreachable, timeout), OCR is treated as unavailable for the whole session
 * instead of timing out again for every single image.
 * @returns {Promise<import('tesseract.js').Worker>}
 * @throws {OcrUnavailableError} When Tesseract.js cannot be initialized.
 */
async function acquireWorker() {
  if (ocrAvailable === false) throw new OcrUnavailableError('Tesseract.js OCR unavailable')
  if (worker) return worker

  const guard = timeout(INIT_TIMEOUT_MS, 'Tesseract init timed out')
  try {
    const pending = createWorker('deu+eng', 1, WORKER_OPTIONS)
    // A worker that only shows up after the timeout must still be terminated,
    // and its rejection must never bubble up as an unhandled rejection.
    pending.then((w) => (guard.done ? w.terminate().catch(() => {}) : null)).catch(() => {})
    worker = await Promise.race([pending, guard.promise])
    if (ocrAvailable === null) {
      ocrAvailable = true
      logger.info('Tesseract.js OCR ready')
    }
    return worker
  } catch (err) {
    // A worker that fails to restart later on is a per-file problem; only the
    // very first start decides whether OCR is available at all.
    if (ocrAvailable !== null) throw err
    ocrAvailable = false
    logger.warn(
      { err: err?.message ?? err },
      'Tesseract.js OCR unavailable (language data missing or unreachable). ' +
        'Images stay unindexed. Run with OCR_BACKEND=cli or place traineddata files in .tesseract-cache/',
    )
    throw new OcrUnavailableError('Tesseract.js OCR unavailable')
  } finally {
    guard.done = true
    guard.cancel()
  }
}

/**
 * Extracts text from an image using Tesseract.js (pure Node, no native deps).
 * Returns an empty string if the file cannot be recognized, so a single bad
 * file never aborts an indexing run.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted plain text, or empty string on failure.
 * @throws {OcrUnavailableError} When OCR is not available this session, so the
 *   file stays unindexed and is retried later.
 */
export async function recognize(filePath) {
  clearTimeout(idleTimer)
  const guard = timeout(OCR_TIMEOUT_MS, `OCR timed out after ${OCR_TIMEOUT_MS / 1000}s`)
  try {
    const job = (await acquireWorker()).recognize(filePath)
    // Swallow a late rejection of the losing promise: Promise.race leaves it
    // unhandled, which would trigger an `unhandledRejection` after a timeout.
    job.catch(() => {})
    const {
      data: { text },
    } = await Promise.race([job, guard.promise])
    return text ?? ''
  } catch (err) {
    if (err instanceof OcrUnavailableError) throw err
    logger.warn({ path: filePath, err: err?.message ?? err }, 'OCR failed, skipping file content')
    // After a timeout the worker is still busy, after an error its state is
    // unknown. Either way the next file gets a fresh one.
    await releaseWorker()
    return ''
  } finally {
    guard.done = true
    guard.cancel()
    idleTimer = setTimeout(releaseWorker, IDLE_RELEASE_MS)
    idleTimer.unref()
  }
}
