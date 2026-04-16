/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as realFs from 'node:fs/promises'

vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn() },
}))

vi.mock('../indexer/ocr/index.js', () => ({
  getOcrBackend: vi.fn(),
}))

vi.mock('pdf-parse/lib/pdf-parse.js', () => ({
  default: vi.fn(),
}))

// Mock node:fs/promises so we can control readFile in the pdf extractor.
// We use vi.importActual to preserve real implementations for writeFile/unlink
// used in the text extractor test.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
  }
})

import mammoth from 'mammoth'
import { getOcrBackend } from '../indexer/ocr/index.js'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { readFile } from 'node:fs/promises'

import { extract as extractText } from '../indexer/extractors/text.js'
import { extract as extractDocx } from '../indexer/extractors/docx.js'
import { extract as extractPdf } from '../indexer/extractors/pdf.js'
import { extract as extractImage } from '../indexer/extractors/image.js'

describe('text extractor', () => {
  it('reads file content as utf-8', async () => {
    const tmp = join(tmpdir(), `nanosearch-test-${Date.now()}.txt`)
    await realFs.writeFile(tmp, 'hello from txt')
    const content = await extractText(tmp)
    expect(content).toBe('hello from txt')
    await realFs.unlink(tmp)
  })
})

describe('docx extractor', () => {
  beforeEach(() => {
    mammoth.extractRawText.mockResolvedValue({ value: 'docx content here' })
  })

  it('extracts text via mammoth', async () => {
    const content = await extractDocx('/fake/doc.docx')
    expect(content).toBe('docx content here')
    expect(mammoth.extractRawText).toHaveBeenCalledWith({ path: '/fake/doc.docx' })
  })
})

describe('pdf extractor', () => {
  const mockOcr = { recognize: vi.fn() }

  beforeEach(() => {
    getOcrBackend.mockResolvedValue(mockOcr)
    mockOcr.recognize.mockReset()
    readFile.mockResolvedValue(Buffer.from('fake pdf bytes'))
  })

  afterEach(() => {
    readFile.mockReset()
  })

  it('returns native text when pdf-parse/lib/pdf-parse.js returns substantial content', async () => {
    pdfParse.mockResolvedValue({ text: 'a'.repeat(100) })
    const content = await extractPdf('/fake/doc.pdf')
    expect(content).toBe('a'.repeat(100))
    expect(mockOcr.recognize).not.toHaveBeenCalled()
  })

  it('returns short native text without falling back to OCR', async () => {
    pdfParse.mockResolvedValue({ text: 'tiny' })
    const content = await extractPdf('/fake/short.pdf')
    expect(content).toBe('tiny')
    expect(mockOcr.recognize).not.toHaveBeenCalled()
  })

  it('falls back to OCR when pdf-parse/lib/pdf-parse.js returns no text', async () => {
    pdfParse.mockResolvedValue({ text: '' })
    mockOcr.recognize.mockResolvedValue('ocr result')
    const content = await extractPdf('/fake/scanned.pdf')
    expect(content).toBe('ocr result')
    expect(mockOcr.recognize).toHaveBeenCalledWith('/fake/scanned.pdf')
  })
})

describe('image extractor', () => {
  const mockOcr = { recognize: vi.fn() }

  beforeEach(() => {
    getOcrBackend.mockResolvedValue(mockOcr)
    mockOcr.recognize.mockResolvedValue('text from image')
  })

  it('delegates to OCR backend', async () => {
    const content = await extractImage('/fake/photo.jpg')
    expect(content).toBe('text from image')
    expect(mockOcr.recognize).toHaveBeenCalledWith('/fake/photo.jpg')
  })
})
