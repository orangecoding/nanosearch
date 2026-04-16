/**
 * Downloads Tesseract language model files (deu + eng) into .tesseract-cache/
 * at the project root. The files are fetched from the official Tesseract.js
 * CDN, decompressed on the fly, and written to disk.
 *
 * This script runs automatically as part of `yarn inst`. It is safe to run
 * multiple times — already-present files are skipped.
 */

import https from 'node:https'
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = join(ROOT, '.tesseract-cache')
const BASE_URL = 'https://tessdata.projectnaptha.com/4.0.0_best'
const LANGS = ['eng', 'deu']

await mkdir(CACHE_DIR, { recursive: true })

let allPresent = true

for (const lang of LANGS) {
  const outPath = join(CACHE_DIR, `${lang}.traineddata`)

  try {
    await stat(outPath)
    console.log(`  ✓ ${lang}.traineddata already in .tesseract-cache/`)
    continue
  } catch {
    // File not present — download it
  }

  allPresent = false
  const url = `${BASE_URL}/${lang}.traineddata.gz`
  process.stdout.write(`  ↓ Downloading ${lang}.traineddata … `)

  await new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        pipeline(res, createGunzip(), createWriteStream(outPath)).then(resolve).catch(reject)
      })
      .on('error', reject)
  })

  console.log('done')
}

if (allPresent) {
  console.log('  Tesseract language data already up to date.')
} else {
  console.log('  Tesseract language data ready in .tesseract-cache/')
}
