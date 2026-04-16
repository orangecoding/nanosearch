# Re-index Progress Fix & Generic Document Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the re-index race condition that leaves the UI stuck in "Indexing…" state, and replace the DocumentViewer's strict type-based rendering with extension-based rendering that shows plain text for all text-like files.

**Architecture:** Four independent tasks in order: (1) make ProgressOverlay null-safe so it can show "Preparing…" before the first SSE event, (2) fix the App.jsx race condition using a ref to detect when `done: true` arrives before the POST 202 resolves, (3) rewrite DocumentViewer to use an extension→mode map with a new `text` case, (4) move the Download button to the viewer header so it is always visible.

**Tech Stack:** React 19, Vitest 4, @testing-library/react 16, @testing-library/jest-dom 6

---

## Files changed

| File                                              | Change                                               |
| ------------------------------------------------- | ---------------------------------------------------- |
| `lib/frontend/src/components/ProgressOverlay.jsx` | Add null-safe "Preparing…" state                     |
| `lib/frontend/src/components/DocumentViewer.jsx`  | RENDER_MODE map, text case, Download in header       |
| `lib/frontend/src/App.jsx`                        | `donePendingRef` race fix, ProgressOverlay condition |
| `lib/frontend/src/index.css`                      | Add `.doc-viewer-pre`                                |
| `lib/frontend/src/__tests__/components.test.jsx`  | Update ProgressOverlay + DocumentViewer tests        |
| `lib/frontend/src/__tests__/app.test.jsx`         | Add race-condition regression test                   |

---

## Task 1: ProgressOverlay — null-safe "Preparing…" state

When `isIndexing` first becomes `true`, no `progress` data has arrived yet. The overlay must handle being rendered with no props (all `undefined`).

**Files:**

- Modify: `lib/frontend/src/components/ProgressOverlay.jsx`
- Test: `lib/frontend/src/__tests__/components.test.jsx`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('ProgressOverlay', ...)` block in `lib/frontend/src/__tests__/components.test.jsx`:

```jsx
it('shows "Preparing…" when rendered with no progress data', () => {
  render(<ProgressOverlay />)
  expect(screen.getByText('Preparing…')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd lib/frontend && npx vitest run src/__tests__/components.test.jsx
```

Expected: FAIL — `Unable to find an element with the text: Preparing…`

- [ ] **Step 3: Update ProgressOverlay to handle undefined props**

Replace the entire contents of `lib/frontend/src/components/ProgressOverlay.jsx` with:

```jsx
/**
 * Formats an ETA in seconds to a human-readable string.
 * @param {number} eta - Seconds remaining, or -1 when not yet calculable.
 * @returns {string}
 */
function formatEta(eta) {
  if (eta === -1) return 'Calculating...'
  if (eta < 60) return 'Less than a minute remaining'
  if (eta < 120) return 'About 1 minute remaining'
  return `About ${Math.round(eta / 60)} minutes remaining`
}

/**
 * Displays indexing progress with a progress bar, file counter, and ETA.
 * Renders a "Preparing…" skeleton when called with no props (before the first SSE event).
 * @param {{ file?: string, processed?: number, total?: number, percent?: number, eta?: number }} props
 */
export function ProgressOverlay({ file, processed, total, percent, eta }) {
  if (file === undefined) {
    return (
      <div className="progress-overlay">
        <p className="progress-filename">Preparing…</p>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: '0%' }} />
        </div>
        <p className="progress-label">Starting…</p>
        <p className="progress-eta">&nbsp;</p>
      </div>
    )
  }

  return (
    <div className="progress-overlay">
      <p className="progress-filename">{file}</p>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-label">
        {processed} of {total} files ({percent}%)
      </p>
      <p className="progress-eta">{formatEta(eta)}</p>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests and confirm all pass**

```bash
cd lib/frontend && npx vitest run src/__tests__/components.test.jsx
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/frontend/src/components/ProgressOverlay.jsx lib/frontend/src/__tests__/components.test.jsx
git commit -m "feat: show Preparing… in ProgressOverlay before first SSE event"
```

---

## Task 2: App.jsx — race condition fix + ProgressOverlay always shown

**Root cause recap:** For a fast incremental run the `done: true` SSE event arrives before the POST `/api/index` 202 response is processed. The fix uses a ref (`donePendingRef`) set synchronously by the SSE handler; `startIndex` reads the ref after the await and skips setting `'indexing'` if `done` already fired.

Also removes the `&& progress` guard so ProgressOverlay renders from the first tick of `isIndexing`.

**Files:**

- Modify: `lib/frontend/src/App.jsx`
- Test: `lib/frontend/src/__tests__/app.test.jsx`

- [ ] **Step 1: Write the failing regression test**

In `lib/frontend/src/__tests__/app.test.jsx`, add `waitFor` to the existing import and add a new test at the end of the `describe('App', ...)` block:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App.jsx'
```

```jsx
it('does not get stuck in indexing when done event arrives before 202 response', async () => {
  const user = userEvent.setup()

  let messageHandler = null
  const mockES = { close: vi.fn() }
  Object.defineProperty(mockES, 'onmessage', {
    set(fn) {
      messageHandler = fn
    },
    configurable: true,
  })
  globalThis.EventSource = vi.fn(function () {
    return mockES
  })

  fetch
    .mockResolvedValueOnce({ json: () => Promise.resolve({ indexed: false, fileCount: 0 }) })
    .mockImplementationOnce(() => {
      // Fire done: true synchronously before this promise resolves (simulates race)
      messageHandler?.({ data: JSON.stringify({ done: true, fileCount: 0 }) })
      return Promise.resolve({ status: 202, json: () => Promise.resolve({ started: true }) })
    })
    .mockResolvedValue({ json: () => Promise.resolve({ indexed: true, fileCount: 0 }) })

  render(<App />)
  await waitFor(() => screen.getByRole('button', { name: /create index/i }))

  await user.click(screen.getByRole('button', { name: /create index/i }))

  // Should end up in ready state — Re-Index button visible and not disabled
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /re-index/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd lib/frontend && npx vitest run src/__tests__/app.test.jsx
```

Expected: FAIL — the button never transitions from `'indexing'` back to `'ready'`.

- [ ] **Step 3: Apply the three changes to App.jsx**

**Change A** — add `donePendingRef` (one line after the existing `useRef` calls, around line 128):

```jsx
const searchBoxRef = useRef(null)
const resultListRef = useRef(null)
const donePendingRef = useRef(false)
```

**Change B** — update `handleSSEEvent` to set the ref before changing state:

```jsx
const handleSSEEvent = useCallback(
  (event) => {
    if (event.done) {
      donePendingRef.current = true
      setProgress(null)
      setAppStatus('ready')
      refetch()
    } else {
      setProgress(event)
    }
  },
  [refetch],
)
```

**Change C** — update `startIndex` to check the ref and add `refetch` to its deps:

```jsx
const startIndex = useCallback(
  async (full = false) => {
    const res = await fetch('/api/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full }),
    })
    if (res.status === 202) {
      if (donePendingRef.current) {
        donePendingRef.current = false
        refetch()
      } else {
        setAppStatus('indexing')
      }
    }
  },
  [refetch],
)
```

**Change D** — remove the `&& progress` guard on the ProgressOverlay (around line 269):

```jsx
{
  isIndexing && <ProgressOverlay {...progress} />
}
```

- [ ] **Step 4: Run all frontend tests and confirm they all pass**

```bash
cd lib/frontend && npx vitest run
```

Expected: All 33 tests pass (32 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add lib/frontend/src/App.jsx lib/frontend/src/__tests__/app.test.jsx
git commit -m "fix: prevent indexing state getting stuck when done SSE event races 202 response"
```

---

## Task 3: DocumentViewer — extension-based RENDER_MODE + text case

Replaces `switch (result.type)` with an extension-derived `renderMode`. Adds a `text` case that fetches the raw file and renders it in a `<pre>`. Keeps the Download link in the `none` case for now (moved in Task 4).

**Files:**

- Modify: `lib/frontend/src/components/DocumentViewer.jsx`
- Test: `lib/frontend/src/__tests__/components.test.jsx`

- [ ] **Step 1: Write the failing test**

Add `waitFor` to the import line in `lib/frontend/src/__tests__/components.test.jsx`:

```jsx
import { render, screen, act, waitFor } from '@testing-library/react'
```

Add this test inside `describe('DocumentViewer', ...)`:

```jsx
const csvResult = { path: '/docs/data.csv', filename: 'data.csv', type: 'txt', snippet: '...' }

it('fetches and renders plain text in a pre element for text types (e.g. csv)', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    text: () => Promise.resolve('a,b\n1,2'),
  })
  const { container } = render(<DocumentViewer result={csvResult} onBack={() => {}} />)
  expect(screen.getByText('Loading…')).toBeInTheDocument()
  await waitFor(() => expect(container.querySelector('pre')).toBeInTheDocument())
  expect(container.querySelector('pre').textContent).toBe('a,b\n1,2')
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd lib/frontend && npx vitest run src/__tests__/components.test.jsx
```

Expected: FAIL — no `<pre>` is rendered; the CSV result falls through to the "Cannot be rendered" block.

- [ ] **Step 3: Rewrite DocumentViewer.jsx**

Replace the entire contents of `lib/frontend/src/components/DocumentViewer.jsx` with:

```jsx
import { useState, useEffect } from 'react'
import { marked } from 'marked'

/**
 * Maps file extensions to a render mode.
 * Any extension not listed here falls back to 'text' — safe because the
 * backend indexer only accepts files it can extract text from.
 * @type {Record<string, 'image'|'pdf'|'html'|'md'|'text'|'none'>}
 */
const RENDER_MODE = {
  // Images
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  svg: 'image',
  tiff: 'image',
  tif: 'image',
  // PDF
  pdf: 'pdf',
  // HTML
  html: 'html',
  htm: 'html',
  // Markdown
  md: 'md',
  markdown: 'md',
  // Plain text and code
  txt: 'text',
  csv: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',
  log: 'text',
  xml: 'text',
  toml: 'text',
  ini: 'text',
  cfg: 'text',
  conf: 'text',
  sh: 'text',
  bash: 'text',
  zsh: 'text',
  py: 'text',
  js: 'text',
  ts: 'text',
  jsx: 'text',
  tsx: 'text',
  rs: 'text',
  go: 'text',
  java: 'text',
  c: 'text',
  cpp: 'text',
  h: 'text',
  cs: 'text',
  rb: 'text',
  php: 'text',
  // Known binary formats — cannot be rendered in a browser
  docx: 'none',
  doc: 'none',
  xlsx: 'none',
  xls: 'none',
  pptx: 'none',
  ppt: 'none',
  odt: 'none',
  ods: 'none',
  odp: 'none',
}

/**
 * Returns the lowercase extension from a filename, or '' if there is none.
 * @param {string} filename
 * @returns {string}
 */
function getExt(filename) {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

/**
 * Renders a document inline based on its file extension.
 * - image  → <img> full-width
 * - md     → markdown parsed with `marked`, rendered as HTML
 * - pdf    → native <embed>
 * - html   → sandboxed <iframe>
 * - text   → raw content in a <pre> block
 * - none   → "Cannot be rendered" notice with file path, copy button, and download link
 * - (unknown extension) → treated as text
 *
 * Content is fetched from GET /api/file, which only serves indexed paths.
 * The dangerouslySetInnerHTML for markdown is safe: content comes from the
 * user's own local files, already trusted by the indexer.
 *
 * @param {{ result: object, onBack: () => void }} props
 */
export function DocumentViewer({ result, onBack }) {
  const [fetchedContent, setFetchedContent] = useState(null)

  const ext = getExt(result.filename)
  const renderMode = RENDER_MODE[ext] ?? 'text'
  const fileUrl = `/api/file?path=${encodeURIComponent(result.path)}`

  useEffect(() => {
    if (renderMode !== 'md' && renderMode !== 'text') {
      setFetchedContent(null)
      return
    }
    let ignored = false
    setFetchedContent(null)
    fetch(`/api/file?path=${encodeURIComponent(result.path)}`)
      .then((r) => r.text())
      .then((text) => {
        if (!ignored) {
          setFetchedContent(renderMode === 'md' ? marked.parse(text) : text)
        }
      })
      .catch(() => {
        if (!ignored) {
          setFetchedContent(renderMode === 'md' ? '<p>Failed to load file.</p>' : 'Failed to load file.')
        }
      })
    return () => {
      ignored = true
    }
  }, [result.path, renderMode])

  function renderContent() {
    switch (renderMode) {
      case 'image':
        return <img src={fileUrl} alt={result.filename} className="doc-viewer-image" />
      case 'md':
        return fetchedContent !== null ? (
          <div className="doc-viewer-markdown" dangerouslySetInnerHTML={{ __html: fetchedContent }} />
        ) : (
          <div className="doc-viewer-loading">Loading…</div>
        )
      case 'pdf':
        return <embed src={fileUrl} type="application/pdf" className="doc-viewer-pdf" />
      case 'html':
        return <iframe src={fileUrl} className="doc-viewer-iframe" sandbox="" title={result.filename} />
      case 'text':
        return fetchedContent !== null ? (
          <pre className="doc-viewer-pre">{fetchedContent}</pre>
        ) : (
          <div className="doc-viewer-loading">Loading…</div>
        )
      default:
        return (
          <div className="doc-viewer-unrenderable">
            <span className="doc-viewer-unrenderable-icon">📂</span>
            <p className="doc-viewer-unrenderable-title">Cannot be rendered</p>
            <p className="doc-viewer-unrenderable-hint">Open this file in its native app.</p>
            <div className="doc-viewer-path-row">
              <code className="doc-viewer-path">{result.path}</code>
              <button className="doc-viewer-copy-btn" onClick={() => navigator.clipboard.writeText(result.path)}>
                Copy
              </button>
            </div>
            <a className="index-btn" href={fileUrl} download={result.filename}>
              Download
            </a>
          </div>
        )
    }
  }

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-header">
        <button className="doc-viewer-back" onClick={onBack}>
          ← Results
        </button>
        <span className="doc-viewer-separator">·</span>
        <span className="result-filename">{result.filename}</span>
        <span className="result-type-badge">{result.type}</span>
      </div>
      <div className="doc-viewer-body">{renderContent()}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run all frontend tests and confirm they all pass**

```bash
cd lib/frontend && npx vitest run
```

Expected: All 35 tests pass (32 original + 1 from Task 1 + 1 from Task 2 + 1 new CSV test). The existing pdf/image/html/md/unrenderable tests all pass because the extension-based lookup produces the same modes as before for those file types.

- [ ] **Step 5: Commit**

```bash
git add lib/frontend/src/components/DocumentViewer.jsx lib/frontend/src/__tests__/components.test.jsx
git commit -m "feat: render text files (csv, json, log, code, etc.) as plain text in DocumentViewer"
```

---

## Task 4: DocumentViewer — Download button in header + `.doc-viewer-pre` CSS

Moves the Download link out of the `none` (unrenderable) case into the header so it is visible for every file type. Adds the CSS for the new `<pre>` block.

**Files:**

- Modify: `lib/frontend/src/components/DocumentViewer.jsx`
- Modify: `lib/frontend/src/index.css`
- Test: `lib/frontend/src/__tests__/components.test.jsx`

- [ ] **Step 1: Write the failing tests**

In `lib/frontend/src/__tests__/components.test.jsx`, update the unrenderable test (remove the Download assertions — the Download link is moving to the header) and add a new header test. The final two tests in `describe('DocumentViewer', ...)` should look like this:

```jsx
it('renders "Cannot be rendered" notice and Copy button for unrenderable types', () => {
  render(<DocumentViewer result={docxResult} onBack={() => {}} />)
  expect(screen.getByText('Cannot be rendered')).toBeInTheDocument()
  expect(screen.getByText('Copy')).toBeInTheDocument()
  expect(screen.getByText('/docs/contract.docx')).toBeInTheDocument()
})

it('renders a Download link in the header for every file type', () => {
  render(<DocumentViewer result={pdfResult} onBack={() => {}} />)
  const link = screen.getByRole('link', { name: /download/i })
  expect(link).toBeInTheDocument()
  expect(link.getAttribute('download')).toBe('report.pdf')
  expect(link.getAttribute('href')).toContain(encodeURIComponent('/docs/report.pdf'))
})
```

- [ ] **Step 2: Run the tests and confirm the new header test fails**

```bash
cd lib/frontend && npx vitest run src/__tests__/components.test.jsx
```

Expected: The unrenderable test now passes (Download assertion removed). The new header test FAILS — no Download link in the header yet.

- [ ] **Step 3: Move Download link to header in DocumentViewer.jsx**

**Change A** — remove the `<a className="index-btn" ...>Download</a>` from the `default` case in `renderContent`. The `default` block should now end with:

```jsx
      default:
        return (
          <div className="doc-viewer-unrenderable">
            <span className="doc-viewer-unrenderable-icon">📂</span>
            <p className="doc-viewer-unrenderable-title">Cannot be rendered</p>
            <p className="doc-viewer-unrenderable-hint">Open this file in its native app.</p>
            <div className="doc-viewer-path-row">
              <code className="doc-viewer-path">{result.path}</code>
              <button
                className="doc-viewer-copy-btn"
                onClick={() => navigator.clipboard.writeText(result.path)}
              >
                Copy
              </button>
            </div>
          </div>
        )
```

**Change B** — add the Download link to the header (`style={{ marginLeft: 'auto' }}` pushes it to the right):

```jsx
return (
  <div className="doc-viewer">
    <div className="doc-viewer-header">
      <button className="doc-viewer-back" onClick={onBack}>
        ← Results
      </button>
      <span className="doc-viewer-separator">·</span>
      <span className="result-filename">{result.filename}</span>
      <span className="result-type-badge">{result.type}</span>
      <a className="index-btn" href={fileUrl} download={result.filename} style={{ marginLeft: 'auto' }}>
        Download
      </a>
    </div>
    <div className="doc-viewer-body">{renderContent()}</div>
  </div>
)
```

- [ ] **Step 4: Add `.doc-viewer-pre` to index.css**

Find the `/* ---- Cannot be rendered ---- */` comment in `lib/frontend/src/index.css` (around line 945) and insert the following block immediately before it:

```css
/* ---- Plain text viewer ---- */
.doc-viewer-pre {
  margin: 0;
  padding: 24px 28px;
  background: var(--color-surface);
  border: none;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-x: auto;
  color: var(--color-text);
}
```

- [ ] **Step 5: Run all frontend tests and confirm they all pass**

```bash
cd lib/frontend && npx vitest run
```

Expected: All 36 tests pass (32 original + 1 T1 + 1 T2 + 1 T3 + 1 T4).

- [ ] **Step 6: Run the full test suite (backend + frontend)**

```bash
cd /path/to/nanosearch && yarn test
```

Expected: All 74 tests pass (40 backend + 34 frontend).

- [ ] **Step 7: Commit**

```bash
git add lib/frontend/src/components/DocumentViewer.jsx lib/frontend/src/index.css lib/frontend/src/__tests__/components.test.jsx
git commit -m "feat: show Download button in viewer header for all file types"
```
