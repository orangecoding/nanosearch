/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdir, writeFile, rm, chmod } from 'node:fs/promises'
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

  it('returns a content hash for every file', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'empty.txt'), '')

    const [file] = await scanDirectory(dir)
    // sha1 of the empty string - pins both the algorithm and the encoding.
    expect(file.hash).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it('gives files with identical content the same hash', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'a.txt'), 'same bytes')
    await writeFile(join(dir, 'b.txt'), 'same bytes')
    await writeFile(join(dir, 'c.txt'), 'other bytes')

    const files = await scanDirectory(dir)
    const byName = Object.fromEntries(files.map((f) => [f.path.split('/').pop(), f.hash]))
    expect(byName['a.txt']).toBe(byName['b.txt'])
    expect(byName['c.txt']).not.toBe(byName['a.txt'])
  })

  it('hashes every file when there are more files than the concurrency limit', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(dir, { recursive: true })
    for (let i = 0; i < 25; i++) {
      await writeFile(join(dir, `f${i}.txt`), `content ${i}`)
    }

    const files = await scanDirectory(dir)
    expect(files).toHaveLength(25)
    expect(files.every((f) => typeof f.hash === 'string' && f.hash.length === 40)).toBe(true)
    expect(new Set(files.map((f) => f.hash)).size).toBe(25)
  })

  it('returns a null hash for a file it cannot read', async () => {
    dir = join(tmpdir(), randomUUID())
    await mkdir(dir, { recursive: true })
    const locked = join(dir, 'locked.txt')
    await writeFile(locked, 'secret')
    await chmod(locked, 0o000)

    const [file] = await scanDirectory(dir)
    await chmod(locked, 0o600)
    expect(file.hash).toBeNull()
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
