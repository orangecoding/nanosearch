/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'node:fs/promises'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { recognizePdf } from '../ocr/pdf.js'
import logger from '../../logger.js'

/**
 * Extracts text from a PDF file.
 * Tries native text extraction first via pdf-parse.
 * Falls back to OCR only if pdf-parse yields no text at all (fully image-based
 * scan) or fails outright (damaged/unsupported PDF). The OCR fallback rasterizes
 * the pages first, because Tesseract cannot read PDF files directly.
 * @param {string} filePath - Absolute path to the PDF file.
 * @returns {Promise<string>} Extracted plain text.
 */
export async function extract(filePath) {
  let text = ''

  try {
    const buffer = await readFile(filePath)
    const result = await pdfParse(buffer)
    text = result?.text ?? ''
  } catch (err) {
    logger.warn({ path: filePath, err: err?.message }, 'Native PDF text extraction failed, trying OCR')
  }

  if (text.trim().length > 0) {
    return text
  }

  return recognizePdf(filePath)
}
