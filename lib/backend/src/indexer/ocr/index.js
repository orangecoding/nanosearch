/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { config } from '../../config.js'

/**
 * Returns the active OCR backend based on the OCR_BACKEND config value.
 * Dynamically imports the backend module to avoid loading both at startup.
 * @returns {Promise<{ recognize: (filePath: string) => Promise<string> }>}
 */
export async function getOcrBackend() {
  if (config.ocrBackend === 'cli') {
    return import('./cli.js')
  }
  return import('./js.js')
}
