/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'node:fs/promises'

/**
 * Extracts plain text from a TXT or Markdown file.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>}
 */
export async function extract(filePath) {
  return readFile(filePath, 'utf8')
}
