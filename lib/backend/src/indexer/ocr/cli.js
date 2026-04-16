/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

/**
 * Extracts text from an image using the system Tesseract CLI.
 * Writes output to a temp file, reads it, then cleans up.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted plain text.
 */
export async function recognize(filePath) {
  const outBase = join(tmpdir(), randomUUID())
  await execFileAsync('tesseract', [filePath, outBase, '-l', 'deu+eng'])
  const text = await readFile(`${outBase}.txt`, 'utf8')
  await unlink(`${outBase}.txt`).catch(() => {})
  return text
}
