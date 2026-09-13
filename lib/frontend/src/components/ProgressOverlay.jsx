/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

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
 * Displays indexing progress with a progress bar, file counter, and ETA.
 *
 * Renders a "Preparing…" skeleton before the first event, and an "up to date"
 * state when the scan found nothing to do.
 * @param {{ file?: string, processed?: number, total?: number, percent?: number, eta?: number, scanned?: number, moved?: number, removed?: number }} props
 */
export function ProgressOverlay({ file, processed, total, percent, eta, scanned, moved, removed }) {
  const summary =
    scanned === undefined ? null : (
      <p className="progress-summary">{formatScanSummary({ scanned, total, moved, removed })}</p>
    )

  if (file === undefined) {
    const upToDate = scanned !== undefined && total === 0
    return (
      <div className="progress-overlay">
        <p className="progress-filename">{upToDate ? 'Index is up to date' : 'Preparing…'}</p>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: upToDate ? '100%' : '0%' }} />
        </div>
        <p className="progress-label">{upToDate ? 'Nothing to re-index' : 'Starting…'}</p>
        {summary}
        <p className="progress-eta">&nbsp;</p>
      </div>
    )
  }

  return (
    <div className="progress-overlay">
      <p className="progress-filename">{file}</p>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-label">
        {processed} of {total} files ({percent}%)
      </p>
      {summary}
      <p className="progress-eta">{formatEta(eta)}</p>
    </div>
  )
}
