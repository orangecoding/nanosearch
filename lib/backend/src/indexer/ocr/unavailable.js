/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Thrown when OCR cannot run at all in this environment (Tesseract or the PDF
 * rasterizer is missing). Unlike a file that simply contains no readable text,
 * this must not be stored as empty content: the indexer leaves the file
 * unindexed so it is picked up again once OCR works.
 */
export class OcrUnavailableError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'OcrUnavailableError'
  }
}
