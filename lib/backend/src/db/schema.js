/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

/**
 * Opens or creates the SQLite database and initializes the FTS5 schema.
 * @param {string} dbPath - Filesystem path or ':memory:' for in-memory.
 * @returns {import('better-sqlite3').Database}
 */
export function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id    INTEGER PRIMARY KEY,
      path  TEXT UNIQUE NOT NULL,
      mtime INTEGER NOT NULL,
      size  INTEGER NOT NULL,
      type  TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path UNINDEXED,
      content,
      tokenize = 'unicode61'
    );
  `)
  return db
}
