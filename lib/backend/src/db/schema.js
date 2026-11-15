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
  // Safe with WAL: a crash can lose the last commits but never corrupts the
  // database, and it saves an fsync for every indexed file.
  db.pragma('synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id    INTEGER PRIMARY KEY,
      path  TEXT UNIQUE NOT NULL,
      mtime INTEGER NOT NULL,
      size  INTEGER NOT NULL,
      type  TEXT NOT NULL,
      hash  TEXT
    );
  `)
  migrate(db)
  return db
}

/** Current schema version, stored in SQLite's user_version pragma. */
const SCHEMA_VERSION = 1

/**
 * Applies schema changes to databases created by an older version.
 *
 * Databases written before versioning existed report user_version 0, the same
 * as a brand new file, so both take the same path below.
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

  if (db.pragma('user_version', { simple: true }) >= SCHEMA_VERSION) return

  // Version 1 keys the FTS table by rowid (= files.id) instead of an unindexed
  // path column. Looking a row up by path meant a full scan of every stored
  // document for each indexed, moved or deleted file.
  const legacy = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'files_fts'").get()
  db.transaction(() => {
    db.exec(`CREATE VIRTUAL TABLE files_fts_v1 USING fts5(content, tokenize = 'unicode61')`)
    if (legacy) {
      db.exec(`
        INSERT INTO files_fts_v1 (rowid, content)
          SELECT f.id, t.content FROM files_fts t JOIN files f ON f.path = t.path GROUP BY f.id;
        DROP TABLE files_fts;
      `)
    }
    db.exec('ALTER TABLE files_fts_v1 RENAME TO files_fts')
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
  })()
}
