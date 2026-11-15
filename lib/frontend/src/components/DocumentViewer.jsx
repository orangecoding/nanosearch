/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Marked } from 'marked'
import { FileTile } from './ResultItem.jsx'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  DownloadIcon,
  ExternalIcon,
  FileIcon,
} from './Icons.jsx'
import { shouldIgnoreShortcut } from '../keyboard.js'

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Schemes a link or image in a rendered document may use. */
const SAFE_SCHEME = /^(?:https?|mailto):/i
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Markdown renderer for indexed files, which are untrusted content: marked
 * passes embedded HTML through as-is and does not vet link targets. Raw HTML
 * is therefore shown as text, and URLs with a scheme other than http(s) or
 * mailto (javascript:, data:, ...) are dropped.
 */
const markdown = new Marked({
  renderer: {
    html: ({ text }) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]),
  },
  walkTokens(token) {
    if (token.type !== 'link' && token.type !== 'image') return
    // Browsers ignore whitespace and control characters inside a scheme.
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    const href = token.href.replace(/[\x00-\x20]/g, '')
    if (ANY_SCHEME.test(href) && !SAFE_SCHEME.test(href)) token.href = ''
  },
})

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
  odp: 'none',
  ods: 'none',
}

/** Highlighting stops after this many hits so a huge log cannot freeze the page. */
const MAX_HITS = 1000

const WORD_CHAR = '[\\p{L}\\p{N}]'

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
 * The folder part of a path, including the trailing separator.
 * @param {string} path
 * @returns {string}
 */
function dirname(path) {
  return path.replace(/[^\\/]*$/, '')
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The words the backend marked as hits in a result snippet. They are the
 * tokens FTS actually matched, so they also cover the Query builder.
 * @param {string | undefined} snippet - Escaped HTML with <mark> tags.
 * @returns {string[]}
 */
function snippetTerms(snippet) {
  if (!snippet) return []
  const doc = new DOMParser().parseFromString(snippet, 'text/html')
  const words = [...doc.querySelectorAll('mark')].map((m) => m.textContent.trim().toLowerCase()).filter(Boolean)
  return [...new Set(words)]
}

/**
 * Builds the pattern that finds hits in the preview. Prefixes match the start
 * of a word (how FTS treats a search word unless exact match is on), whole
 * words only match on their own.
 * @param {string[]} prefixes
 * @param {string[]} words
 * @returns {RegExp | null}
 */
function buildMatcher(prefixes, words) {
  const alternatives = [
    ...prefixes.map((t) => `${escapeRegExp(t)}${WORD_CHAR}*`),
    ...words.map((t) => `${escapeRegExp(t)}(?!${WORD_CHAR})`),
  ]
  if (alternatives.length === 0) return null
  return new RegExp(`(?<!${WORD_CHAR})(?:${alternatives.join('|')})`, 'giu')
}

/**
 * Wraps every hit in plain text in a <mark>.
 * @param {string} text
 * @param {RegExp | null} matcher
 * @returns {{ content: import('react').ReactNode, count: number }}
 */
function highlightText(text, matcher) {
  if (!matcher) return { content: text, count: 0 }
  const content = []
  let last = 0
  let count = 0
  for (const m of text.matchAll(matcher)) {
    if (m.index > last) content.push(text.slice(last, m.index))
    content.push(
      <mark key={m.index} className="doc-hit">
        {m[0]}
      </mark>,
    )
    last = m.index + m[0].length
    if (++count >= MAX_HITS) break
  }
  if (count === 0) return { content: text, count: 0 }
  content.push(text.slice(last))
  return { content, count }
}

/**
 * Wraps every hit in the text of rendered HTML in a <mark>. Works on a parsed,
 * inert copy and only touches text nodes, so no markup from the document can
 * be introduced or changed.
 * @param {string} html
 * @param {RegExp | null} matcher
 * @returns {{ content: string, count: number }}
 */
function highlightHtml(html, matcher) {
  if (!matcher) return { content: html, count: 0 }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)

  let count = 0
  for (const node of textNodes) {
    if (count >= MAX_HITS) break
    const text = node.nodeValue
    const fragment = doc.createDocumentFragment()
    let last = 0
    for (const m of text.matchAll(matcher)) {
      if (m.index > last) fragment.append(text.slice(last, m.index))
      const mark = doc.createElement('mark')
      mark.className = 'doc-hit'
      mark.textContent = m[0]
      fragment.append(mark)
      last = m.index + m[0].length
      if (++count >= MAX_HITS) break
    }
    if (last === 0) continue
    fragment.append(text.slice(last))
    node.replaceWith(fragment)
  }
  return { content: count === 0 ? html : doc.body.innerHTML, count }
}

/**
 * Copies text through a temporary selection, for browsers that refuse the
 * Clipboard API (it needs a secure context, which a LAN address over http is not).
 * @param {string} text
 * @returns {boolean}
 */
function copyWithSelection(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

const COPY_LABELS = { idle: 'Copy', done: 'Copied', failed: 'Copy failed' }

/**
 * Previews a search result next to the list of all results.
 *
 * Renders the document inline based on its file extension:
 * - image  → <img>
 * - md     → markdown parsed with `marked`, rendered as HTML
 * - pdf    → native <embed>
 * - html   → sandboxed <iframe>
 * - text   → raw content in a <pre> block
 * - none   → "Cannot be rendered" notice
 * - (unknown extension) → treated as text
 *
 * Search hits are highlighted in Markdown and text previews. Content is
 * fetched from GET /api/file, which only serves indexed paths. The
 * dangerouslySetInnerHTML for markdown is safe: raw HTML in the source is
 * escaped and unsafe link schemes are dropped (see `markdown` above).
 *
 * Keys: ← / → previous and next result, N / Shift+N next and previous hit,
 * Esc closes the preview.
 *
 * @param {{ result: object, results?: object[], onSelect?: (result: object) => void, onBack: () => void, highlight?: { terms: string[], prefix: boolean } }} props
 */
export function DocumentViewer({ result, results = [], onSelect, onBack, highlight }) {
  const [fetchedContent, setFetchedContent] = useState(null)
  const [copyState, setCopyState] = useState('idle')
  const [activeHit, setActiveHit] = useState(-1)
  const [shownPath, setShownPath] = useState(result.path)
  const bodyRef = useRef(null)
  const copyTimer = useRef(null)

  // Another result was picked: start over instead of showing the old file's state.
  if (shownPath !== result.path) {
    setShownPath(result.path)
    setFetchedContent(null)
    setActiveHit(-1)
    setCopyState('idle')
  }

  const ext = getExt(result.filename)
  const renderMode = RENDER_MODE[ext] ?? 'text'
  const fileUrl = `/api/file?path=${encodeURIComponent(result.path)}`

  const index = results.findIndex((r) => r.path === result.path)
  const hasList = index !== -1 && results.length > 1 && typeof onSelect === 'function'
  const prev = hasList && index > 0 ? results[index - 1] : null
  const next = hasList && index < results.length - 1 ? results[index + 1] : null

  const matcher = useMemo(() => {
    const terms = highlight?.terms ?? []
    const prefix = highlight?.prefix ?? false
    return buildMatcher(prefix ? terms : [], [...(prefix ? [] : terms), ...snippetTerms(result.snippet)])
  }, [highlight, result.snippet])

  const rendered = useMemo(() => {
    if (fetchedContent === null) return null
    if (renderMode === 'md') return highlightHtml(fetchedContent, matcher)
    if (renderMode === 'text') return highlightText(fetchedContent, matcher)
    return null
  }, [fetchedContent, renderMode, matcher])
  const hitCount = rendered?.count ?? 0

  useEffect(() => {
    if (renderMode !== 'md' && renderMode !== 'text') {
      setFetchedContent(null)
      return
    }
    let ignored = false
    setFetchedContent(null)
    fetch(fileUrl)
      .then((r) => r.text())
      .then((text) => {
        if (!ignored) {
          setFetchedContent(renderMode === 'md' ? markdown.parse(text) : text)
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
  }, [fileUrl, renderMode])

  // Marks the current hit and brings it into view.
  useEffect(() => {
    const marks = bodyRef.current?.querySelectorAll('mark.doc-hit') ?? []
    marks.forEach((mark, i) => mark.classList.toggle('is-active', i === activeHit))
    if (activeHit < 0 || !marks[activeHit]) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    marks[activeHit].scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [activeHit, rendered])

  const stepHit = useCallback(
    (direction) => {
      if (hitCount === 0) return
      setActiveHit((i) => (i < 0 ? (direction > 0 ? 0 : hitCount - 1) : (i + direction + hitCount) % hitCount))
    },
    [hitCount],
  )

  const copyPath = useCallback(async () => {
    let ok
    try {
      await navigator.clipboard.writeText(result.path)
      ok = true
    } catch {
      ok = copyWithSelection(result.path)
    }
    setCopyState(ok ? 'done' : 'failed')
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyState('idle'), 1600)
  }, [result.path])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  useEffect(() => {
    function onKeyDown(e) {
      if (shouldIgnoreShortcut(e)) return
      if (e.key === 'Escape') {
        onBack()
      } else if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault()
        onSelect(prev)
      } else if (e.key === 'ArrowRight' && next) {
        e.preventDefault()
        onSelect(next)
      } else if ((e.key === 'n' || e.key === 'N') && hitCount > 0) {
        e.preventDefault()
        stepHit(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBack, onSelect, prev, next, hitCount, stepHit])

  function renderContent() {
    switch (renderMode) {
      case 'image':
        return <img src={fileUrl} alt={result.filename} className="doc-viewer-image" />
      case 'md':
        return rendered !== null ? (
          <div className="doc-viewer-markdown" dangerouslySetInnerHTML={{ __html: rendered.content }} />
        ) : (
          <div className="doc-viewer-loading">Loading…</div>
        )
      case 'pdf':
        return <embed src={fileUrl} type="application/pdf" className="doc-viewer-pdf" />
      case 'html':
        return <iframe src={fileUrl} className="doc-viewer-iframe" sandbox="" title={result.filename} />
      case 'text':
        return rendered !== null ? (
          <pre className="doc-viewer-pre">{rendered.content}</pre>
        ) : (
          <div className="doc-viewer-loading">Loading…</div>
        )
      default:
        return (
          <div className="doc-viewer-unrenderable">
            <span className="doc-viewer-unrenderable-icon">
              <FileIcon size={26} />
            </span>
            <p className="doc-viewer-unrenderable-title">Cannot be rendered</p>
            <p className="doc-viewer-unrenderable-hint">
              Browsers can’t show this file type. Download it, or copy the path above and open it in its own app.
            </p>
          </div>
        )
    }
  }

  const showMatchBar = rendered !== null && matcher !== null

  return (
    <div className="viewer">
      <div className="viewer-topbar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Results
        </button>
        <div className="key-legend">
          {hasList && (
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> Previous / next file
            </span>
          )}
          {hitCount > 0 && (
            <span>
              <kbd>N</kbd> Next hit
            </span>
          )}
          <span>
            <kbd>Esc</kbd> Close preview
          </span>
        </div>
      </div>

      <div className="viewer-split">
        {hasList && (
          <aside className="viewer-list" aria-labelledby="viewer-list-title">
            <h2 id="viewer-list-title" className="viewer-list-title">
              {results.length} results
            </h2>
            <ul className="viewer-list-items" role="list">
              {results.map((r) => (
                <li key={r.path}>
                  <button
                    type="button"
                    className="viewer-list-item"
                    aria-current={r.path === result.path ? 'true' : undefined}
                    onClick={() => onSelect(r)}
                  >
                    <FileTile type={r.type} small />
                    <span className="viewer-list-text">
                      <span className="viewer-list-name">{r.filename}</span>
                      <span className="viewer-list-path">{dirname(r.path)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <section className="doc-viewer" aria-labelledby="doc-viewer-title">
          <div className="doc-viewer-header">
            <FileTile type={result.type} />
            <div className="doc-viewer-heading">
              <h2 id="doc-viewer-title" className="doc-viewer-title">
                {result.filename}
              </h2>
              <div className="doc-viewer-path-row">
                <code className="doc-viewer-path" title={result.path}>
                  {result.path}
                </code>
                <button
                  type="button"
                  className={`btn btn--ghost btn--sm${copyState === 'done' ? ' doc-viewer-copy--done' : ''}`}
                  onClick={copyPath}
                >
                  {copyState === 'done' ? <CheckIcon size={14} strokeWidth={2.6} /> : <CopyIcon size={14} />}
                  {COPY_LABELS[copyState]}
                  <span className="sr-only"> file path</span>
                </button>
                <span className="sr-only" aria-live="polite">
                  {copyState === 'done' ? 'Path copied' : copyState === 'failed' ? 'Copying the path failed' : ''}
                </span>
              </div>
            </div>
            <div className="doc-viewer-actions">
              {hasList && (
                <div className="pager">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label="Previous result"
                    disabled={!prev}
                    onClick={() => onSelect(prev)}
                  >
                    <ChevronLeftIcon />
                  </button>
                  <span className="pager-label">
                    {index + 1} of {results.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label="Next result"
                    disabled={!next}
                    onClick={() => onSelect(next)}
                  >
                    <ChevronRightIcon />
                  </button>
                </div>
              )}
              <a className="btn btn--secondary" href={fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalIcon size={15} />
                Open raw
              </a>
              <a className="btn btn--primary" href={fileUrl} download={result.filename}>
                <DownloadIcon size={15} strokeWidth={2.4} />
                Download
              </a>
            </div>
          </div>

          {showMatchBar && (
            <div className="doc-viewer-matchbar">
              <span className="doc-viewer-matchbar-label">
                <span className="doc-viewer-matchbar-swatch" aria-hidden="true" />
                {hitCount === 0
                  ? 'No hits highlighted in this preview'
                  : `${hitCount}${hitCount >= MAX_HITS ? '+' : ''} ${hitCount === 1 ? 'hit' : 'hits'} in this file`}
              </span>
              {hitCount > 0 && (
                <div className="pager">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label="Previous hit"
                    onClick={() => stepHit(-1)}
                  >
                    <ChevronUpIcon />
                  </button>
                  <span className="pager-label">
                    {activeHit >= 0 ? activeHit + 1 : '–'} / {hitCount}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label="Next hit"
                    onClick={() => stepHit(1)}
                  >
                    <ChevronDownIcon />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="doc-viewer-body" ref={bodyRef}>
            {renderContent()}
          </div>
        </section>
      </div>
    </div>
  )
}
