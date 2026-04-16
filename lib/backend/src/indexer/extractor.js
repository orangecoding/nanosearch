/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { extname } from 'node:path'
import { extract as extractText } from './extractors/text.js'
import { extract as extractHtml } from './extractors/html.js'
import { extract as extractDocx } from './extractors/docx.js'
import { extract as extractPdf } from './extractors/pdf.js'
import { extract as extractImage } from './extractors/image.js'

/** @type {Record<string, { extract: (path: string) => Promise<string>, type: string }>} */
const TYPE_MAP = {
  // Documents
  '.pdf': { extract: extractPdf, type: 'pdf' },
  '.docx': { extract: extractDocx, type: 'docx' },
  '.rtf': { extract: extractText, type: 'txt' },
  // Plain text
  '.txt': { extract: extractText, type: 'txt' },
  '.md': { extract: extractText, type: 'md' },
  '.csv': { extract: extractText, type: 'txt' },
  '.json': { extract: extractText, type: 'txt' },
  '.yaml': { extract: extractText, type: 'txt' },
  '.yml': { extract: extractText, type: 'txt' },
  '.log': { extract: extractText, type: 'txt' },
  '.xml': { extract: extractText, type: 'txt' },
  // Web / markup
  '.html': { extract: extractHtml, type: 'html' },
  '.htm': { extract: extractHtml, type: 'html' },
  // Images (OCR)
  '.jpg': { extract: extractImage, type: 'image' },
  '.jpeg': { extract: extractImage, type: 'image' },
  '.png': { extract: extractImage, type: 'image' },
  '.tiff': { extract: extractImage, type: 'image' },
  '.tif': { extract: extractImage, type: 'image' },
}

/**
 * Routes a file to the correct extractor based on its extension.
 * Falls back to the plain-text extractor for any extension not in TYPE_MAP,
 * which covers custom extensions added via EXTRA_EXTENSIONS in .env.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<{ content: string, type: string }>}
 */
export async function extractFile(filePath) {
  const ext = extname(filePath).toLowerCase()
  const entry = TYPE_MAP[ext] ?? { extract: extractText, type: ext.slice(1) || 'txt' }
  const content = await entry.extract(filePath)
  return { content, type: entry.type }
}
