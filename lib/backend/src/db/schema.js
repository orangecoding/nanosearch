/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

/**
 * Opens or creates the SQLite database, initializes the FTS5 schema and brings
 * an existing database up to date. Runs on every start and is idempotent.
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
      type  TEXT NOT NULL,
      hash  TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path UNINDEXED,
      content,
      tokenize = 'unicode61'
    );
  `)
  migrate(db)
  return db
}

/**
 * Applies schema changes to databases created by an older version.
 *
 * The `hash` column is nullable on purpose: existing rows keep a NULL hash and
 * the indexer backfills it on the next run without re-extracting anything, so
 * upgrading never forces a full re-index.
 * @param {import('better-sqlite3').Database} db
 */
function migrate(db) {
  const columns = db.prepare('PRAGMA table_info(files)').all()
  if (!columns.some((c) => c.name === 'hash')) {
    db.exec('ALTER TABLE files ADD COLUMN hash TEXT')
  }
}
