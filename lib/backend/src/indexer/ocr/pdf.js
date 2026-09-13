/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import logger from '../../logger.js'
import { getOcrBackend } from './index.js'

const execFileAsync = promisify(execFile)

/** Rasterization resolution - high enough for OCR, low enough to stay fast. */
const RASTER_DPI = 200

/** Upper bound of pages rendered per document to keep indexing responsive. */
const MAX_PAGES = 20

/**
 * Extracts the page number from a rasterized file name (`page-12.png` -> 12).
 * @param {string} name - File name produced by pdftoppm.
 * @returns {number}
 */
function pageNumber(name) {
  const match = /(\d+)\.png$/.exec(name)
  return match ? Number(match[1]) : 0
}

/**
 * Whether a PDF rasterizer (poppler's pdftoppm) is available this session.
 * null = not yet checked, true = available, false = unavailable.
 * @type {boolean | null}
 */
let rasterizerAvailable = null

/**
 * Resets the cached rasterizer probe. Only used by tests.
 * @returns {void}
 */
export function resetRasterizerCache() {
  rasterizerAvailable = null
}

/**
 * Checks once per session whether `pdftoppm` can be executed.
 * @returns {Promise<boolean>}
 */
async function checkRasterizer() {
  if (rasterizerAvailable !== null) return rasterizerAvailable

  try {
    // pdftoppm prints its version to stderr and exits with code 0.
    await execFileAsync('pdftoppm', ['-v'])
    rasterizerAvailable = true
    logger.info('PDF rasterizer (pdftoppm) ready - scanned PDFs will be OCR-ed')
  } catch (err) {
    rasterizerAvailable = false
    logger.warn(
      { err: err?.message },
      'PDF rasterizer (pdftoppm) unavailable - scanned PDFs without a text layer will be skipped. ' +
        'Install poppler (macOS: brew install poppler, Debian: apt-get install poppler-utils)',
    )
  }

  return rasterizerAvailable
}

/**
 * OCRs a scanned (image-only) PDF.
 *
 * Tesseract cannot read PDF files at all ("Pdf reading is not supported"), so the
 * document is first rasterized page by page into PNG images which are then fed to
 * the configured OCR backend. Everything degrades to an empty string instead of
 * throwing, so a single unreadable document never aborts an indexing run.
 * @param {string} filePath - Absolute path to the PDF file.
 * @returns {Promise<string>} Extracted plain text, or empty string on failure.
 */
export async function recognizePdf(filePath) {
  if (!(await checkRasterizer())) return ''

  let dir
  try {
    dir = await mkdtemp(join(tmpdir(), 'nanosearch-pdf-'))
    await execFileAsync('pdftoppm', [
      '-png',
      '-r',
      String(RASTER_DPI),
      '-f',
      '1',
      '-l',
      String(MAX_PAGES),
      filePath,
      join(dir, 'page'),
    ])

    // pdftoppm names the files page-1.png, page-2.png, ... page-10.png, so they
    // must be ordered numerically - a plain lexicographic sort would scramble them.
    const pages = (await readdir(dir))
      .filter((name) => name.endsWith('.png'))
      .sort((a, b) => pageNumber(a) - pageNumber(b))
    if (pages.length === 0) {
      logger.warn({ path: filePath }, 'PDF produced no rasterized pages, skipping OCR')
      return ''
    }

    const ocr = await getOcrBackend()
    const texts = []
    for (const page of pages) {
      const text = await ocr.recognize(join(dir, page))
      if (text?.trim()) texts.push(text.trim())
    }
    return texts.join('\n\n')
  } catch (err) {
    logger.warn({ path: filePath, err: err?.message }, 'PDF OCR failed, skipping')
    return ''
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
