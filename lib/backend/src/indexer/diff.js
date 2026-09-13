/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * @typedef {{ path: string, mtime: number, size: number, hash: string | null }} DiskFile
 * @typedef {{ mtime: number, size: number, hash: string | null }} StoredMeta
 * @typedef {{ path: string, mtime: number, size: number, hash: string | null }} RemovedFile
 * @typedef {{ from: string, to: string, mtime: number, size: number, hash: string }} MovedFile
 */

/**
 * Decides whether a file on disk still matches what is stored in the index.
 * The content hash is authoritative, so a file whose mtime was bumped without
 * an actual edit (touch, rsync without -t, a bind mount, a cloud sync client)
 * stays unchanged and is never re-extracted. When either side has no hash -
 * a row written before the hash column existed, or a file that could not be
 * read - the old mtime + size heuristic is used instead.
 * @param {StoredMeta} stored
 * @param {DiskFile} file
 * @returns {boolean}
 */
function isUnchanged(stored, file) {
  if (stored.hash != null && file.hash != null) return stored.hash === file.hash
  return stored.mtime === file.mtime && stored.size === file.size
}

/**
 * Compares the files found on disk against the indexed metadata and splits
 * them into the sets an indexing run has to act on.
 *
 * `unchanged` needs no work at all. `metaRefresh` is the subset of `unchanged`
 * whose stored row drifted (missing hash, or a bumped mtime) and only needs a
 * cheap metadata write - never a re-extraction. `moved` pairs a vanished path
 * with a new path holding identical content, which is applied as a rename and
 * therefore also skips extraction. Only `added` and `modified` are real work.
 *
 * @param {DiskFile[]} diskFiles - Files found by the scanner, hashes included.
 * @param {Map<string, StoredMeta>} storedMeta - Indexed metadata by path.
 * @returns {{ unchanged: DiskFile[], modified: DiskFile[], added: DiskFile[], removed: RemovedFile[], moved: MovedFile[], metaRefresh: DiskFile[] }}
 */
export function classify(diskFiles, storedMeta) {
  /** @type {DiskFile[]} */ const unchanged = []
  /** @type {DiskFile[]} */ const modified = []
  /** @type {DiskFile[]} */ const added = []
  /** @type {DiskFile[]} */ const metaRefresh = []
  const onDisk = new Set()

  for (const file of diskFiles) {
    onDisk.add(file.path)
    const stored = storedMeta.get(file.path)

    if (!stored) {
      added.push(file)
      continue
    }

    if (!isUnchanged(stored, file)) {
      modified.push(file)
      continue
    }

    unchanged.push(file)
    // Content is identical, but the stored row no longer describes the file
    // accurately. Write the current metadata so the next run compares cleanly.
    if (stored.hash !== file.hash || stored.mtime !== file.mtime || stored.size !== file.size) {
      metaRefresh.push(file)
    }
  }

  /** @type {RemovedFile[]} */ const removed = []
  for (const [path, meta] of storedMeta) {
    if (!onDisk.has(path)) removed.push({ path, ...meta })
  }

  return { unchanged, modified, metaRefresh, ...pairMoves(added, removed) }
}

/**
 * Pairs added paths with removed paths that hold identical content, turning
 * them into moves. Each removed path is consumed by at most one added path, so
 * duplicated content yields one move plus a genuine addition rather than two
 * moves. Rows without a hash cannot be paired and stay a delete plus an add.
 * @param {DiskFile[]} added
 * @param {RemovedFile[]} removed
 * @returns {{ added: DiskFile[], removed: RemovedFile[], moved: MovedFile[] }}
 */
function pairMoves(added, removed) {
  /** @type {Map<string, RemovedFile[]>} */
  const candidatesByHash = new Map()
  for (const file of removed) {
    if (file.hash == null) continue
    const bucket = candidatesByHash.get(file.hash)
    if (bucket) bucket.push(file)
    else candidatesByHash.set(file.hash, [file])
  }

  /** @type {MovedFile[]} */ const moved = []
  /** @type {DiskFile[]} */ const stillAdded = []

  for (const file of added) {
    const bucket = file.hash == null ? undefined : candidatesByHash.get(file.hash)
    if (!bucket?.length) {
      stillAdded.push(file)
      continue
    }
    const source = bucket.shift()
    moved.push({ from: source.path, to: file.path, mtime: file.mtime, size: file.size, hash: file.hash })
  }

  const movedFrom = new Set(moved.map((m) => m.from))
  return { added: stillAdded, removed: removed.filter((f) => !movedFrom.has(f.path)), moved }
}
