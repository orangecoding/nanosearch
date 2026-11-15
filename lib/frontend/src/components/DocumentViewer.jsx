/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react'
import { Marked } from 'marked'

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
 * - none   → "Cannot be rendered" notice with file path and copy button
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
        <a className="index-btn" href={fileUrl} download={result.filename} style={{ marginLeft: 'auto' }}>
          Download
        </a>
      </div>
      <div className="doc-viewer-body">{renderContent()}</div>
    </div>
  )
}
