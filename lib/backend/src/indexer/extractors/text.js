/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { open } from 'node:fs/promises'

/**
 * Upper bound of bytes read from a single text file. A multi-gigabyte log
 * would otherwise be loaded into memory in one piece (and fail outright past
 * the maximum string length); the head of such a file is indexed instead.
 */
const MAX_TEXT_BYTES = 32 * 1024 * 1024

/**
 * Extracts plain text from a TXT, Markdown or other plain-text file.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>}
 */
export async function extract(filePath) {
  const handle = await open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    const buffer = Buffer.allocUnsafe(Math.min(size, MAX_TEXT_BYTES))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}
