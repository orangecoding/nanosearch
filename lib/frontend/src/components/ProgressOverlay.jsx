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
 * Displays indexing progress with a progress bar, file counter, and ETA.
 * Renders a "Preparing…" skeleton when called with no props (before the first SSE event).
 * @param {{ file?: string, processed?: number, total?: number, percent?: number, eta?: number }} props
 */
export function ProgressOverlay({ file, processed, total, percent, eta }) {
  if (file === undefined) {
    return (
      <div className="progress-overlay">
        <p className="progress-filename">Preparing…</p>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: '0%' }} />
        </div>
        <p className="progress-label">Starting…</p>
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
      <p className="progress-eta">{formatEta(eta)}</p>
    </div>
  )
}
