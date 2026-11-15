/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Whether a page-wide shortcut has to stay out of this key press: the user is
 * typing, holds a modifier (browser or OS shortcut), or works inside a dialog.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function shouldIgnoreShortcut(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true
  return target.closest('dialog') !== null
}
