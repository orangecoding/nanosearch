/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @type {Set<import('node:http').ServerResponse>} */
const subscribers = new Set()

let indexing = false

/**
 * Returns the set of currently connected SSE clients.
 * @returns {Set<import('node:http').ServerResponse>}
 */
export function getSubscribers() {
  return subscribers
}

/**
 * Returns whether an indexing run is currently in progress.
 * @returns {boolean}
 */
export function isIndexing() {
  return indexing
}

/**
 * Updates the indexing state flag.
 * @param {boolean} value
 */
export function setIndexing(value) {
  indexing = value
}
