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
  }
})

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { recognize } from '../indexer/ocr/cli.js'

describe('Tesseract CLI backend', () => {
  beforeEach(() => {
    execFile.mockImplementation((_cmd, _args, cb) => cb(null, '', ''))
    readFile.mockResolvedValue('recognized text\n')
  })

  it('calls tesseract with deu+eng language flag', async () => {
    await recognize('/path/to/image.jpg')
    expect(execFile).toHaveBeenCalledWith(
      'tesseract',
      expect.arrayContaining(['/path/to/image.jpg', expect.any(String), '-l', 'deu+eng']),
      expect.any(Function),
    )
  })

  it('returns the text from the output file', async () => {
    const result = await recognize('/path/to/image.jpg')
    expect(result).toBe('recognized text\n')
  })
})
