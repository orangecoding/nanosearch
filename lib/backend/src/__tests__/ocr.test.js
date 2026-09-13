/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises')
  return {
    ...actual,
    readFile: vi.fn(),
    unlink: vi.fn().mockResolvedValue(undefined),
    mkdtemp: vi.fn(),
    readdir: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../indexer/ocr/index.js', () => ({
  getOcrBackend: vi.fn(),
}))

import { execFile } from 'node:child_process'
import { readFile, unlink, mkdtemp, readdir } from 'node:fs/promises'
import { getOcrBackend } from '../indexer/ocr/index.js'
import { recognize } from '../indexer/ocr/cli.js'
import { recognizePdf, resetRasterizerCache } from '../indexer/ocr/pdf.js'

/**
 * promisify(execFile) calls execFile(file, args, options, callback), so the
 * callback is always the last argument regardless of how many are passed.
 * @param {unknown[]} args - Arguments execFile was called with.
 * @returns {(...cbArgs: unknown[]) => void}
 */
function callbackOf(args) {
  return args[args.length - 1]
}

describe('Tesseract CLI backend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    execFile.mockImplementation((...args) => callbackOf(args)(null, '', ''))
    readFile.mockResolvedValue('recognized text\n')
  })

  it('calls tesseract with deu+eng language flag', async () => {
    await recognize('/path/to/image.jpg')
    expect(execFile).toHaveBeenCalledWith(
      'tesseract',
      expect.arrayContaining(['/path/to/image.jpg', expect.any(String), '-l', 'deu+eng']),
      expect.anything(),
      expect.any(Function),
    )
  })

  it('returns the text from the output file', async () => {
    const result = await recognize('/path/to/image.jpg')
    expect(result).toBe('recognized text\n')
  })

  it('returns an empty string and cleans up when tesseract fails', async () => {
    execFile.mockImplementation((...args) => callbackOf(args)(new Error('tesseract not found')))
    const result = await recognize('/path/to/image.jpg')
    expect(result).toBe('')
    expect(unlink).toHaveBeenCalled()
  })
})

describe('scanned PDF OCR', () => {
  const mockOcr = { recognize: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    resetRasterizerCache()
    getOcrBackend.mockResolvedValue(mockOcr)
    mkdtemp.mockResolvedValue('/tmp/nanosearch-pdf-abc')
    execFile.mockImplementation((...args) => callbackOf(args)(null, '', ''))
    readdir.mockResolvedValue(['page-1.png', 'page-2.png'])
    mockOcr.recognize.mockImplementation(async (p) => `text of ${p}`)
  })

  it('rasterizes the PDF to PNG instead of handing it to Tesseract', async () => {
    await recognizePdf('/docs/scan.pdf')
    const rasterCall = execFile.mock.calls.find((call) => call[1].includes('/docs/scan.pdf'))
    expect(rasterCall[0]).toBe('pdftoppm')
    expect(rasterCall[1]).toContain('-png')
    expect(mockOcr.recognize).not.toHaveBeenCalledWith('/docs/scan.pdf')
  })

  it('OCRs every rendered page and joins the text', async () => {
    const text = await recognizePdf('/docs/scan.pdf')
    expect(mockOcr.recognize).toHaveBeenCalledTimes(2)
    expect(text).toBe('text of /tmp/nanosearch-pdf-abc/page-1.png\n\ntext of /tmp/nanosearch-pdf-abc/page-2.png')
  })

  it('processes pages in numeric, not lexicographic, order', async () => {
    readdir.mockResolvedValue(['page-10.png', 'page-2.png', 'page-1.png'])
    const text = await recognizePdf('/docs/scan.pdf')
    expect(text).toBe(
      [
        'text of /tmp/nanosearch-pdf-abc/page-1.png',
        'text of /tmp/nanosearch-pdf-abc/page-2.png',
        'text of /tmp/nanosearch-pdf-abc/page-10.png',
      ].join('\n\n'),
    )
  })

  it('returns an empty string when no rasterizer is installed', async () => {
    execFile.mockImplementation((...args) => callbackOf(args)(new Error('spawn pdftoppm ENOENT')))
    const text = await recognizePdf('/docs/scan.pdf')
    expect(text).toBe('')
    expect(mockOcr.recognize).not.toHaveBeenCalled()
  })

  it('returns an empty string when a page cannot be recognized', async () => {
    mockOcr.recognize.mockRejectedValue(new Error('Error attempting to read image.'))
    await expect(recognizePdf('/docs/scan.pdf')).resolves.toBe('')
  })

  it('returns an empty string when rasterizing produces no pages', async () => {
    readdir.mockResolvedValue([])
    await expect(recognizePdf('/docs/scan.pdf')).resolves.toBe('')
  })
})
