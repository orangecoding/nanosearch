/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Inserts or updates a file record and its full-text content.
 * Runs as a single transaction to keep files and files_fts in sync.
 * @param {import('better-sqlite3').Database} db
 * @param {{ path: string, mtime: number, size: number, type: string, content: string, hash?: string | null }} file
 */
export function upsertFile(db, { path, mtime, size, type, content, hash = null }) {
  const upsertMeta = db.prepare(`
    INSERT INTO files (path, mtime, size, type, hash)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime = excluded.mtime,
      size = excluded.size,
      type = excluded.type,
      hash = excluded.hash
  `)
  const deleteFts = db.prepare('DELETE FROM files_fts WHERE path = ?')
  const insertFts = db.prepare('INSERT INTO files_fts (path, content) VALUES (?, ?)')

  db.transaction(() => {
    upsertMeta.run(path, mtime, size, type, hash)
    deleteFts.run(path)
    insertFts.run(path, content)
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
    db.prepare('DELETE FROM files WHERE path = ?').run(to)
    db.prepare('DELETE FROM files_fts WHERE path = ?').run(to)
    db.prepare('UPDATE files SET path = ?, mtime = ?, size = ?, hash = ? WHERE path = ?').run(
      to,
      mtime,
      size,
      hash,
      from,
    )
    db.prepare('UPDATE files_fts SET path = ? WHERE path = ?').run(to, from)
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
  db.prepare('UPDATE files SET mtime = ?, size = ?, hash = ? WHERE path = ?').run(mtime, size, hash, path)
}

/**
 * Removes a file and its FTS content from the database.
 * @param {import('better-sqlite3').Database} db
 * @param {string} path
 */
export function deleteFile(db, path) {
  db.transaction(() => {
    db.prepare('DELETE FROM files WHERE path = ?').run(path)
    db.prepare('DELETE FROM files_fts WHERE path = ?').run(path)
  })()
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

/**
 * Builds an FTS5 query string from raw user input.
 * Default (prefix) mode: appends * to each token so partial words match,
 * e.g. "Gesund" finds "Gesundheit". FTS5 operator characters are stripped
 * from each token before the * is appended to avoid syntax errors.
 * Exact mode: wraps each token in double quotes for literal matching only.
 * @param {string} raw
 * @param {boolean} exact
 * @returns {string}
 */
function buildQuery(raw, exact) {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  if (exact) {
    // All tokens must appear exactly - joined with explicit AND
    return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' AND ')
  }
  // All tokens must appear (AND), each with prefix matching so partial
  // words match too. e.g. "solar versammlung" → solar* AND versammlung*
  return tokens
    .map((t) => t.replace(/["'()*:^{}~-]/g, ''))
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(' AND ')
}

/**
 * Performs a full-text search and returns up to 15 BM25-ranked results.
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {boolean} [exact=false] - When true, requires exact token matches.
 * @param {boolean} [prebuilt=false] - When true, query is an already-formatted
 *   FTS5 expression (from the query builder) and bypasses buildQuery entirely.
 * @returns {Array<{ path: string, filename: string, type: string, snippet: string }>}
 */
export function search(db, query, exact = false, prebuilt = false) {
  const ftsQuery = prebuilt ? query : buildQuery(query, exact)
  const rows = db
    .prepare(
      `
      SELECT
        f.path,
        f.type,
        snippet(files_fts, 1, '<mark>', '</mark>', '...', 20) AS snippet
      FROM files_fts
      JOIN files f ON f.path = files_fts.path
      WHERE files_fts MATCH ?
      ORDER BY bm25(files_fts)
      LIMIT 15
    `,
    )
    .all(ftsQuery)

  return rows.map((r) => ({
    path: r.path,
    filename: r.path.split('/').pop(),
    type: r.type,
    snippet: r.snippet,
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
