/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import mammoth from 'mammoth'

/**
 * Extracts plain text from a DOCX file using mammoth.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>}
 */
export async function extract(filePath) {
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}
