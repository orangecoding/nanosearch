/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

vi.mock('../config.js', () => ({
  config: {
    extensions: ['.txt', '.md', '.pdf', '.png', '.jpg', '.docx'],
    logLevel: 'silent',
  },
}))

import { scanDirectory } from '../indexer/scanner.js'

describe('scanDirectory', () => {
  let dir

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('returns supported files with path, mtime, and size', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'doc.txt'), 'hello')
    await writeFile(join(dir, 'photo.png'), 'fakeimage')
    await writeFile(join(dir, 'ignored.exe'), 'binary')

    const files = await scanDirectory(dir)
    const names = files.map((f) => f.path.split('/').pop()).sort()
    expect(names).toEqual(['doc.txt', 'photo.png'])
    expect(files[0]).toHaveProperty('mtime')
    expect(files[0]).toHaveProperty('size')
    expect(typeof files[0].mtime).toBe('number')
  })

  it('scans subdirectories recursively', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(join(dir, 'sub'), { recursive: true })
    await writeFile(join(dir, 'a.md'), '')
    await writeFile(join(dir, 'sub', 'b.pdf'), '')

    const files = await scanDirectory(dir)
    expect(files).toHaveLength(2)
  })

  it('returns empty array for empty directory', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(dir, { recursive: true })
    expect(await scanDirectory(dir)).toEqual([])
  })

  it('does not index extensions not in the configured list', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'script.py'), 'print("hello")')
    await writeFile(join(dir, 'notes.txt'), 'hello')

    const files = await scanDirectory(dir)
    const names = files.map((f) => f.path.split('/').pop())
    expect(names).toEqual(['notes.txt'])
  })
})
