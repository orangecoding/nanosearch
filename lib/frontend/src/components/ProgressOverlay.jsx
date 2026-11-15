/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ClockIcon, InfoIcon } from './Icons.jsx'

/**
 * Formats an ETA in seconds to a human-readable string.
 * @param {number} eta - Seconds remaining, or -1 when not yet calculable.
 * @returns {string}
 */
function formatEta(eta) {
  if (eta === -1) return 'Calculating...'
  if (eta < 60) return 'Less than a minute remaining'
  if (eta < 120) return 'About 1 minute remaining'
  return `About ${Math.round(eta / 60)} minutes remaining`
}

/**
 * Summarises the scan so it is obvious that only a subset is being processed:
 * a run over 12430 files that touches 12 of them should not look like a full
 * rebuild. Moves and deletions are listed only when they happened.
 * @param {{ scanned: number, total: number, moved?: number, removed?: number }} props
 * @returns {string}
 */
function formatScanSummary({ scanned, total, moved, removed }) {
  const parts = [`${total} of ${scanned} files changed`]
  if (moved) parts.push(`${moved} moved`)
  if (removed) parts.push(`${removed} removed`)
  return parts.join(' · ')
}

/**
 * Displays indexing progress: big percentage, progress bar, the file being
 * read, the scan summary and the ETA.
 *
 * Renders a "Preparing…" state before the first event, and an "up to date"
 * state when the scan found nothing to do.
 * @param {{ file?: string, processed?: number, total?: number, percent?: number, eta?: number, scanned?: number, moved?: number, removed?: number }} props
 */
export function ProgressOverlay({ file, processed, total, percent, eta, scanned, moved, removed }) {
  const started = file !== undefined
  const upToDate = !started && scanned !== undefined && total === 0
  const shownPercent = started ? (percent ?? 0) : upToDate ? 100 : 0

  let title = 'Preparing…'
  let subtitle = 'Looking for new, edited, moved and deleted files.'
  if (upToDate) {
    title = 'Index is up to date'
    subtitle = 'Nothing to re-index.'
  } else if (started) {
    title = 'Indexing'
    subtitle = 'Extracting text from new and changed files.'
  }

  return (
    <section className="progress-card" aria-labelledby="progress-title">
      <div className="progress-head">
        <div>
          <h2 id="progress-title" className="progress-title">
            {title}
          </h2>
          <p className="progress-subtitle">{subtitle}</p>
        </div>
        {started && (
          <span className="progress-eta">
            <ClockIcon size={14} />
            {formatEta(eta)}
          </span>
        )}
      </div>

      <div className="progress-figures">
        <span className="progress-percent">
          {shownPercent}
          <span className="progress-percent-sign">%</span>
        </span>
        {started && (
          <span className="progress-label">
            {processed} of {total} files
          </span>
        )}
      </div>
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-label="Indexing progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shownPercent}
      >
        <div className="progress-bar-fill" style={{ width: `${shownPercent}%` }} />
      </div>

      {started && (
        <div className="progress-file-row">
          <span className="eyebrow">Reading</span>
          <span className="progress-file" title={file}>
            {file}
          </span>
        </div>
      )}

      {scanned !== undefined && (
        <p className="progress-summary">{formatScanSummary({ scanned, total, moved, removed })}</p>
      )}

      <p className="progress-note">
        <InfoIcon size={16} />
        Indexing runs on the server. You can close this tab, the progress is picked up again when you come back.
      </p>
    </section>
  )
}
