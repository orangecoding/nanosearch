/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { runIndexing } from './pipeline.js'
import { isIndexing, setIndexing } from './state.js'
import logger from '../logger.js'

/**
 * Triggers a single incremental re-index run if one is not already in progress.
 * Only new or changed files are (re-)indexed by the pipeline itself.
 * @param {{ db: import('better-sqlite3').Database, dirs: string[] }} options
 * @returns {Promise<void>}
 */
export async function triggerRescan({ db, dirs }) {
  if (isIndexing()) {
    logger.info('Scheduled re-scan skipped - indexing already in progress')
    return
  }

  setIndexing(true)
  try {
    const count = await runIndexing({ db, dirs })
    logger.info({ count }, 'Scheduled re-scan complete')
  } catch (err) {
    logger.error({ err }, 'Scheduled re-scan failed')
  } finally {
    setIndexing(false)
  }
}

/**
 * Starts a periodic re-scan timer that re-indexes new/changed files every
 * `intervalHours` hours. When `intervalHours` is 0 (or not positive), no timer
 * is started and periodic re-indexing is disabled.
 * @param {{ db: import('better-sqlite3').Database, dirs: string[], intervalHours: number }} options
 * @returns {NodeJS.Timeout | null} The timer handle, or null when disabled.
 */
export function startRescanScheduler({ db, dirs, intervalHours }) {
  if (!intervalHours || intervalHours <= 0) {
    logger.info('Periodic re-indexing disabled (RESCAN_INTERVAL_HOURS=0)')
    return null
  }

  const intervalMs = intervalHours * 60 * 60 * 1000
  logger.info({ intervalHours }, 'Periodic re-indexing enabled')

  const timer = setInterval(() => {
    triggerRescan({ db, dirs })
  }, intervalMs)

  // Do not keep the process alive solely for the re-scan timer.
  if (typeof timer.unref === 'function') timer.unref()

  return timer
}
