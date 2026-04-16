/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getOcrBackend } from '../ocr/index.js'

/**
 * Extracts text from an image file (JPG, PNG, TIFF) using the configured OCR backend.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted plain text.
 */
export async function extract(filePath) {
  const ocr = await getOcrBackend()
  return ocr.recognize(filePath)
}
