/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'node:fs/promises'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { getOcrBackend } from '../ocr/index.js'

/**
 * Extracts text from a PDF file.
 * Tries native text extraction first via pdf-parse.
 * Falls back to OCR only if pdf-parse yields no text at all,
 * indicating the PDF is fully image-based (scanned).
 * @param {string} filePath - Absolute path to the PDF file.
 * @returns {Promise<string>} Extracted plain text.
 */
export async function extract(filePath) {
  const buffer = await readFile(filePath)
  const result = await pdfParse(buffer)
  if (result.text.trim().length > 0) {
    return result.text
  }
  const ocr = await getOcrBackend()
  return ocr.recognize(filePath)
}
