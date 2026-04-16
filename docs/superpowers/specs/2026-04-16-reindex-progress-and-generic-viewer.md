# Spec: Re-index Progress Fix & Generic Document Viewer

**Date:** 2026-04-16
**Status:** Approved

---

## 1. Background

Two separate issues are addressed in this spec:

1. **Re-index gets stuck** — when a user clicks Re-Index > Update and no files have changed, the indexing pipeline completes so fast that the `done: true` SSE event arrives at the browser before the POST `/api/index` 202 response is processed. The frontend transitions to `'indexing'` state after `done` has already been handled, and never leaves it.

2. **DocumentViewer is too strict** — the viewer only renders `image`, `pdf`, `html`, and `md` types. Everything else (`.csv`, `.txt`, `.json`, `.log`, custom extensions, etc.) shows "Cannot be rendered", even though the browser is fully capable of displaying them as plain text.

Additionally: the Download button is currently only shown on the "Cannot be rendered" state. It should be available for every file type.

---

## 2. Issue 1 — Re-index Race Condition & Progress Display

### Root cause

The indexing pipeline in `pipeline.js` skips unchanged files with a synchronous SQLite read (`getFileMtime`). For an incremental run with no changed files, the entire loop is synchronous and completes in milliseconds. The sequence that causes the bug:

1. Browser opens SSE connection on mount (already connected).
2. User clicks Update → `fetch('/api/index', { method: 'POST' })` starts.
3. Server sends 202, then immediately calls `runIndexing()`.
4. `runIndexing` finishes (fast) and broadcasts `done: true` over SSE.
5. Browser receives SSE `done: true` → `setAppStatus('ready')` (was already ready, no visible change).
6. Browser receives the 202 HTTP response → `setAppStatus('indexing')`.
7. No more SSE events → stuck in `'indexing'` forever.

### Fix

**`App.jsx`:**

- Add `donePendingRef = useRef(false)`.
- In `handleSSEEvent`: when `event.done` arrives, set `donePendingRef.current = true` before calling `setAppStatus('ready')`.
- In `startIndex`: after the 202 resolves, check `donePendingRef.current`.
  - If `true`: indexing already finished before we knew we were indexing. Clear the ref, call `refetch()`, do NOT set `'indexing'`.
  - If `false`: set `setAppStatus('indexing')` as before.

**ProgressOverlay — blank window fix:**

The overlay is currently gated on `isIndexing && progress`. The first tick of `isIndexing` (before the first SSE event arrives) renders nothing. Fix: render `<ProgressOverlay {...progress} />` whenever `isIndexing` is true, and update `ProgressOverlay` to handle `progress === null` by showing a "Preparing…" indeterminate state.

No backend changes needed.

---

## 3. Issue 2 — Extension-based Generic Rendering

### Rendering decision

The viewer derives the render mode from the file extension extracted from `result.filename` (last segment after `.`, lowercased). This replaces the current `switch (result.type)` which is too coarse (`'txt'` covers csv, json, yaml, log, xml, etc. indistinguishably).

### Render mode map

A `RENDER_MODE` constant in `DocumentViewer.jsx` maps extension → mode:

| Mode         | Extensions                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `image`      | `jpg jpeg png gif webp bmp svg tiff tif`                                                                    |
| `pdf`        | `pdf`                                                                                                       |
| `html`       | `html htm`                                                                                                  |
| `md`         | `md markdown`                                                                                               |
| `text`       | `txt csv json yaml yml log xml toml ini cfg conf sh bash zsh py js ts jsx tsx rs go java c cpp h cs rb php` |
| `none`       | `docx doc xlsx xls pptx ppt odt ods odp`                                                                    |
| _(fallback)_ | any extension not in the map → `text`                                                                       |

The fallback-to-`text` rule is safe: the backend indexer only accepts files it can extract text from, so any unlisted extension is almost certainly a text-based file.

### `renderContent` changes

- Replace `switch (result.type)` with a lookup on the derived extension.
- Add a `text` case: fetch via `/api/file?path=...` (same fetch pattern as `md`) and render as `<pre className="doc-viewer-pre">{content}</pre>`.
- `none` case: shows "Cannot be rendered" notice (file path + Copy button). No Download button here — it is now in the header for all types (see below).

### Download button — always visible

Move the `<a className="index-btn" href={fileUrl} download={result.filename}>Download</a>` from the `none` case into `doc-viewer-header`, rendered for every file type. It sits in the header row alongside the back button and filename.

### CSS additions

`.doc-viewer-pre`: monospace font, `white-space: pre-wrap`, `overflow-x: auto`, same surface/border/padding treatment as `.doc-viewer-markdown`.

---

## 4. Tests

### `components.test.jsx` updates

- **Download button test**: move assertion from the unrenderable test to a shared header check (Download is now always present).
- **Text render case**: add a test for a `.csv` result — mocks `fetch` returning `"a,b\n1,2"`, asserts a `<pre>` is rendered containing that content.
- **Unrenderable test**: remove Download button assertion (it's in the header now), keep Copy button and path assertions.

### No backend test changes needed.

---

## 5. Files changed

| File                                              | Change                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `lib/frontend/src/App.jsx`                        | Add `donePendingRef`, fix `handleSSEEvent` and `startIndex` |
| `lib/frontend/src/components/ProgressOverlay.jsx` | Handle null progress prop with "Preparing…" state           |
| `lib/frontend/src/components/DocumentViewer.jsx`  | Extension-based render mode, text case, Download in header  |
| `lib/frontend/src/index.css`                      | Add `.doc-viewer-pre`                                       |
| `lib/frontend/src/__tests__/components.test.jsx`  | Update tests per above                                      |
