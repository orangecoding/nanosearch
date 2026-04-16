/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'node:fs/promises'

/**
 * Extracts plain text from an HTML file by stripping tags, scripts, styles,
 * and HTML entities. The result is a clean, searchable text representation.
 * @param {string} filePath - Absolute path to the HTML file.
 * @returns {Promise<string>}
 */
export async function extract(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
