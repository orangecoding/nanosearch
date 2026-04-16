/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Displays an informational banner when no index has been created yet.
 */
export function StatusBanner() {
  return (
    <div className="status-banner">
      <p>
        No index yet. Click <strong>Create Index</strong> to get started.
      </p>
    </div>
  )
}
