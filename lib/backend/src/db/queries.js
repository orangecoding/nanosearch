/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { basename } from 'node:path'

/** @type {WeakMap<import('better-sqlite3').Database, Map<string, import('better-sqlite3').Statement>>} */
const statementCache = new WeakMap()

/**
 * Returns a prepared statement, compiling each SQL string once per database
 * instead of on every call.
 * @param {import('better-sqlite3').Database} db
 * @param {string} sql
 * @returns {import('better-sqlite3').Statement}
 */
function stmt(db, sql) {
  let cache = statementCache.get(db)
  if (!cache) statementCache.set(db, (cache = new Map()))
  let statement = cache.get(sql)
  if (!statement) cache.set(sql, (statement = db.prepare(sql)))
  return statement
}

/**
 * Deletes a file row and its FTS content. Must run inside a transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {string} path
 */
function removeByPath(db, path) {
  const row = stmt(db, 'DELETE FROM files WHERE path = ? RETURNING id').get(path)
  if (row) stmt(db, 'DELETE FROM files_fts WHERE rowid = ?').run(row.id)
}

/**
 * Inserts or updates a file record and its full-text content.
 * Runs as a single transaction to keep files and files_fts in sync. The FTS
 * row shares its rowid with files.id, so it is addressed without a scan.
 * @param {import('better-sqlite3').Database} db
 * @param {{ path: string, mtime: number, size: number, type: string, content: string, hash?: string | null }} file
 */
export function upsertFile(db, { path, mtime, size, type, content, hash = null }) {
  db.transaction(() => {
    const { id } = stmt(
      db,
      `INSERT INTO files (path, mtime, size, type, hash)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         mtime = excluded.mtime,
         size = excluded.size,
         type = excluded.type,
         hash = excluded.hash
       RETURNING id`,
    ).get(path, mtime, size, type, hash)
    stmt(db, 'DELETE FROM files_fts WHERE rowid = ?').run(id)
    stmt(db, 'INSERT INTO files_fts (rowid, content) VALUES (?, ?)').run(id, content)
  })()
}

/**
 * Moves an indexed file to a new path without touching its extracted content.
 * A move or rename leaves the bytes untouched, so re-running the extractor
 * (and for scanned PDFs or images, OCR) would be wasted work.
 * @param {import('better-sqlite3').Database} db
 * @param {{ from: string, to: string, mtime: number, size: number, hash: string | null }} move
 */
export function renameFile(db, { from, to, mtime, size, hash }) {
  db.transaction(() => {
    // The destination may still hold a stale row when a file was overwritten
    // by the move; drop it first so the UNIQUE constraint on path holds.
    removeByPath(db, to)
    stmt(db, 'UPDATE files SET path = ?, mtime = ?, size = ?, hash = ? WHERE path = ?').run(to, mtime, size, hash, from)
  })()
}

/**
 * Updates the stored metadata of a file whose content is known to be unchanged.
 * Used to backfill a missing hash and to absorb mtime bumps that did not change
 * the file, so neither costs an extraction.
 * @param {import('better-sqlite3').Database} db
 * @param {{ path: string, mtime: number, size: number, hash: string | null }} file
 */
export function refreshFileMeta(db, { path, mtime, size, hash }) {
  stmt(db, 'UPDATE files SET mtime = ?, size = ?, hash = ? WHERE path = ?').run(mtime, size, hash, path)
}

/**
 * Removes a file and its FTS content from the database.
 * @param {import('better-sqlite3').Database} db
 * @param {string} path
 */
export function deleteFile(db, path) {
  db.transaction(() => removeByPath(db, path))()
}

/**
 * Returns the stored mtime for a path, or null if not indexed.
 * @param {import('better-sqlite3').Database} db
 * @param {string} path
 * @returns {number | null}
 */
export function getFileMtime(db, path) {
  const row = db.prepare('SELECT mtime FROM files WHERE path = ?').get(path)
  return row ? row.mtime : null
}

/**
 * Returns a Map of path → { mtime, size, hash } for every indexed file.
 * Loaded once per run so the pipeline can diff the whole index in memory
 * instead of issuing one query per file.
 * @param {import('better-sqlite3').Database} db
 * @returns {Map<string, { mtime: number, size: number, hash: string | null }>}
 */
export function getAllFileMeta(db) {
  const rows = db.prepare('SELECT path, mtime, size, hash FROM files').all()
  return new Map(rows.map((r) => [r.path, { mtime: r.mtime, size: r.size, hash: r.hash }]))
}

/**
 * Returns the stored content hash for a path, or null when the file is not
 * indexed or was indexed before hashes were recorded.
 * @param {import('better-sqlite3').Database} db
 * @param {string} path
 * @returns {string | null}
 */
export function getFileHash(db, path) {
  const row = db.prepare('SELECT hash FROM files WHERE path = ?').get(path)
  return row ? row.hash : null
}

/**
 * Returns all indexed file paths.
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]}
 */
export function getAllPaths(db) {
  return db
    .prepare('SELECT path FROM files')
    .all()
    .map((r) => r.path)
}

/** A search token is only usable when the tokenizer keeps something of it. */
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * Builds an FTS5 query string from raw user input.
 * Every token is wrapped in double quotes, which makes FTS5 treat it as plain
 * text: punctuation ("invoice.pdf", "user@example.com") and operator words
 * (AND, OR, NOT, NEAR) can no longer produce a syntax error. Tokens made of
 * punctuation only are dropped, since they would match nothing.
 * Default (prefix) mode: appends * to each token so partial words match,
 * e.g. "Gesund" finds "Gesundheit".
 * Exact mode: no prefix matching, whole tokens only.
 * @param {string} raw
 * @param {boolean} exact
 * @returns {string}
 */
function buildQuery(raw, exact) {
  // All tokens must appear (AND). e.g. "solar versammlung" -> "solar"* AND "versammlung"*
  return raw
    .trim()
    .split(/\s+/)
    .filter((t) => HAS_WORD_CHAR.test(t))
    .map((t) => `"${t.replace(/"/g, '""')}"${exact ? '' : '*'}`)
    .join(' AND ')
}

// Control characters cannot occur in a search hit by accident, so they mark
// the highlight boundaries until the snippet has been HTML-escaped.
const MARK_OPEN = '\u0001'
const MARK_CLOSE = '\u0002'
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Turns a raw FTS snippet into HTML that is safe to inject. The snippet is
 * document content, so it is escaped first; only then are the highlight
 * markers replaced with <mark> tags.
 * @param {string} snippet
 * @returns {string}
 */
function toSafeHtml(snippet) {
  return snippet
    .replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
    .replaceAll(MARK_OPEN, '<mark>')
    .replaceAll(MARK_CLOSE, '</mark>')
}

/**
 * Performs a full-text search and returns up to 15 BM25-ranked results.
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {boolean} [exact=false] - When true, requires exact token matches.
 * @param {boolean} [prebuilt=false] - When true, query is an already-formatted
 *   FTS5 expression (from the query builder) and bypasses buildQuery entirely.
 * @returns {Array<{ path: string, filename: string, type: string, snippet: string }>}
 *   `snippet` is HTML: escaped document text with <mark> around the hits.
 */
export function search(db, query, exact = false, prebuilt = false) {
  const ftsQuery = prebuilt ? query : buildQuery(query, exact)
  if (!ftsQuery) return []
  const rows = stmt(
    db,
    `SELECT
       f.path,
       f.type,
       snippet(files_fts, 0, ?, ?, '...', 20) AS snippet
     FROM files_fts
     JOIN files f ON f.id = files_fts.rowid
     WHERE files_fts MATCH ?
     ORDER BY bm25(files_fts)
     LIMIT 15`,
  ).all(MARK_OPEN, MARK_CLOSE, ftsQuery)

  return rows.map((r) => ({
    path: r.path,
    filename: basename(r.path),
    type: r.type,
    snippet: toSafeHtml(r.snippet),
  }))
}

/**
 * Returns the current index status.
 * @param {import('better-sqlite3').Database} db
 * @returns {{ indexed: boolean, fileCount: number }}
 */
export function getIndexStatus(db) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM files').get()
  return { indexed: row.count > 0, fileCount: row.count }
}

/**
 * Removes all indexed files and their FTS content from the database.
 * Used before a full re-index to start completely fresh.
 * @param {import('better-sqlite3').Database} db
 */
export function clearIndex(db) {
  db.transaction(() => {
    db.prepare('DELETE FROM files').run()
    db.prepare('DELETE FROM files_fts').run()
  })()
}
