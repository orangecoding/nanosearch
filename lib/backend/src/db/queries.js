/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Inserts or updates a file record and its full-text content.
 * Runs as a single transaction to keep files and files_fts in sync.
 * @param {import('better-sqlite3').Database} db
 * @param {{ path: string, mtime: number, size: number, type: string, content: string }} file
 */
export function upsertFile(db, { path, mtime, size, type, content }) {
  const upsertMeta = db.prepare(`
    INSERT INTO files (path, mtime, size, type)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, size = excluded.size, type = excluded.type
  `)
  const deleteFts = db.prepare('DELETE FROM files_fts WHERE path = ?')
  const insertFts = db.prepare('INSERT INTO files_fts (path, content) VALUES (?, ?)')

  db.transaction(() => {
    upsertMeta.run(path, mtime, size, type)
    deleteFts.run(path)
    insertFts.run(path, content)
  })()
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
