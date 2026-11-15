/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { SearchBox } from './components/SearchBox.jsx'
import { ResultList } from './components/ResultList.jsx'
import { ProgressOverlay } from './components/ProgressOverlay.jsx'
import { StatusBanner } from './components/StatusBanner.jsx'
import { QueryBuilder } from './components/QueryBuilder.jsx'
import { DocumentViewer } from './components/DocumentViewer.jsx'
import { AlertIcon, HeartIcon, RefreshIcon, SearchIcon, SlidersIcon, XIcon } from './components/Icons.jsx'
import { useIndexStatus } from './hooks/useIndexStatus.js'
import { useSSE } from './hooks/useSSE.js'
import { useSearch } from './hooks/useSearch.js'
import { shouldIgnoreShortcut } from './keyboard.js'

/**
 * @typedef {'loading' | 'no-index' | 'indexing' | 'ready'} AppStatus
 */

/** The backend returns at most this many results (LIMIT in search(), backend db/queries.js). */
const RESULT_LIMIT = 15

/** @type {Record<AppStatus, string>} */
const PLACEHOLDERS = {
  loading: 'Loading…',
  'no-index': 'Search opens once the index is built',
  indexing: 'Search is back as soon as indexing finishes',
  ready: 'Search names, numbers, phrases…',
}

/**
 * Pill in the header that says what state the index is in.
 * @param {{ appStatus: AppStatus, fileCount: number, percent?: number }} props
 */
function StatusChip({ appStatus, fileCount, percent }) {
  if (appStatus === 'loading') return null
  if (appStatus === 'no-index') {
    return (
      <span className="status-chip status-chip--warn">
        <span className="status-dot" />
        No index yet
      </span>
    )
  }
  if (appStatus === 'indexing') {
    return (
      <span className="status-chip status-chip--busy">
        <span className="status-dot" />
        {percent === undefined ? 'Indexing' : `Indexing · ${percent}%`}
      </span>
    )
  }
  return (
    <span className="status-chip status-chip--ok">
      <span className="status-dot" />
      {fileCount.toLocaleString()} {fileCount === 1 ? 'file' : 'files'} indexed
    </span>
  )
}

/**
 * Sticky header with the wordmark, the index status and the re-index action.
 * @param {{ appStatus: AppStatus, fileCount: number, percent?: number, onReindex: () => void }} props
 */
function Header({ appStatus, fileCount, percent, onReindex }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">
          <SearchIcon size={18} strokeWidth={2.6} />
        </span>
        <span className="brand-name">
          nano<span className="brand-name-accent">search</span>
        </span>
      </div>
      <div className="header-actions">
        <StatusChip appStatus={appStatus} fileCount={fileCount} percent={percent} />
        {appStatus === 'ready' && (
          <button type="button" className="btn btn--secondary" onClick={onReindex}>
            <RefreshIcon />
            Re-index
          </button>
        )}
        {appStatus === 'indexing' && (
          <button type="button" className="btn btn--secondary" disabled>
            <RefreshIcon className="spinner" />
            Indexing…
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * Page footer with attribution.
 */
function Footer() {
  return (
    <footer className="app-footer">
      <span>nanosearch · self-hosted full-text search</span>
      <span className="footer-credit">
        Made with <HeartIcon /> by{' '}
        <a href="https://github.com/orangecoding" target="_blank" rel="noopener noreferrer">
          Christian Kellner
        </a>
      </span>
    </footer>
  )
}

/**
 * Short hints shown below the empty search box.
 * @param {{ onOpenBuilder: () => void }} props
 */
function SearchTips({ onOpenBuilder }) {
  return (
    <section className="tips" aria-label="Search tips">
      <div className="tip">
        <h2 className="tip-title">Searches inside files</h2>
        <p className="tip-text">PDF, Word, Markdown, HTML, RTF and plain text. Scanned images are read with OCR.</p>
      </div>
      <div className="tip">
        <h2 className="tip-title">More words, fewer hits</h2>
        <p className="tip-text">Every word you type has to appear somewhere in the file, in any order.</p>
      </div>
      <div className="tip">
        <h2 className="tip-title">Need OR or NOT?</h2>
        <p className="tip-text">
          Combine and exclude words in the{' '}
          <button type="button" className="link-button" onClick={onOpenBuilder}>
            Query builder
          </button>
        </p>
      </div>
    </section>
  )
}

/**
 * Modal that lets the user pick between an incremental update and a full
 * rebuild before anything starts.
 * @param {{ onChoice: (full: boolean) => void, onClose: () => void }} props
 */
function ReindexDialog({ onChoice, onClose }) {
  const [full, setFull] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    // showModal gives focus trapping, Escape and the backdrop for free.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector('input:checked')?.focus()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="reindex-dialog"
      aria-labelledby="reindex-title"
      aria-describedby="reindex-subtitle"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="reindex-panel">
        <div className="reindex-head">
          <div>
            <h2 id="reindex-title" className="reindex-title">
              Re-index
            </h2>
            <p id="reindex-subtitle" className="reindex-subtitle">
              How should the index be brought up to date?
            </p>
          </div>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Close" onClick={onClose}>
            <XIcon size={18} />
          </button>
        </div>

        <fieldset className="reindex-options">
          <legend className="sr-only">Re-index mode</legend>
          <label className={`reindex-option${full ? '' : ' is-selected'}`}>
            <input type="radio" name="reindex-mode" className="radio" checked={!full} onChange={() => setFull(false)} />
            <span className="reindex-option-text">
              <span className="reindex-option-name">
                Update <span className="badge badge--success">Recommended</span>
              </span>
              <span className="reindex-option-desc">
                Keeps the current index. Only files that were added, edited, moved or deleted get processed. Fast.
              </span>
            </span>
          </label>
          <label className={`reindex-option reindex-option--danger${full ? ' is-selected' : ''}`}>
            <input type="radio" name="reindex-mode" className="radio" checked={full} onChange={() => setFull(true)} />
            <span className="reindex-option-text">
              <span className="reindex-option-name">Full reset</span>
              <span className="reindex-option-desc">
                Deletes the index and rebuilds it from scratch. Use this after changing <code>SEARCH_DIRS</code>.
              </span>
            </span>
          </label>
        </fieldset>

        {full && (
          <div className="callout callout--danger" role="alert">
            <AlertIcon size={18} />
            <span>
              The current index is deleted right away. Rebuilding reads every file again, which can take a long time
              with many scanned images.
            </span>
          </div>
        )}

        <div className="reindex-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${full ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => onChoice(full)}
          >
            <RefreshIcon />
            {full ? 'Reset and rebuild' : 'Start update'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

/**
 * Root application component.
 * Manages the state machine: loading, no-index, indexing, ready.
 * Connects hooks for status polling, SSE progress streaming, and search.
 */
export default function App() {
  /** @type {[AppStatus, (s: AppStatus) => void]} */
  const [appStatus, setAppStatus] = useState('loading')
  const [progress, setProgress] = useState(null)
  const [reindexOpen, setReindexOpen] = useState(false)
  const [tab, setTab] = useState('search')
  const [selectedResult, setSelectedResult] = useState(null)

  const searchBoxRef = useRef(null)
  const resultListRef = useRef(null)
  const donePendingRef = useRef(false)
  const wasViewerOpenRef = useRef(false)

  const { indexed, fileCount, indexing: serverIndexing, loading: statusLoading, refetch } = useIndexStatus()
  const { results, setResults, query, setQuery, exact, setExact, searchRaw, searching } = useSearch()

  const isIndexing = appStatus === 'indexing'
  const isReady = appStatus === 'ready'
  const isViewerOpen = selectedResult !== null

  const handleTabChange = useCallback(
    (newTab) => {
      setTab(newTab)
      setResults([])
      setQuery('')
      setSelectedResult(null)
    },
    [setResults, setQuery, setSelectedResult],
  )

  const handleSSEEvent = useCallback(
    (event) => {
      if (event.done) {
        donePendingRef.current = true
        setProgress(null)
        setAppStatus('ready')
        refetch()
      } else {
        // Events are merged rather than replaced: the scan summary arrives once,
        // up front, and has to survive every per-file progress event after it.
        setProgress((prev) => ({ ...prev, ...event }))
      }
    },
    [refetch],
  )

  const { connect: connectSSE } = useSSE(handleSSEEvent)

  // Connect to SSE on mount so progress events are never missed due to
  // the race between POST /api/index returning and the connection opening.
  useEffect(() => {
    connectSSE()
  }, [connectSSE])

  useEffect(() => {
    if (statusLoading || appStatus === 'indexing') return
    setAppStatus(indexed ? 'ready' : 'no-index')
  }, [indexed, statusLoading, appStatus])

  // A run that was already going when the page loaded (started in another tab
  // or by the scheduler): show its progress instead of pretending to be idle.
  // Keyed on the server flag alone, so a stale `true` cannot re-trigger it
  // after the run has finished.
  useEffect(() => {
    if (serverIndexing) setAppStatus('indexing')
  }, [serverIndexing])

  // "/" jumps to the search box from anywhere on the page.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== '/' || isViewerOpen || tab !== 'search' || !isReady || shouldIgnoreShortcut(e)) return
      e.preventDefault()
      searchBoxRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isViewerOpen, tab, isReady])

  // A newly opened preview starts at the top of the page.
  useEffect(() => {
    if (selectedResult) window.scrollTo?.(0, 0)
  }, [selectedResult])

  // Closing the preview hands focus back to the result list it was opened from.
  useEffect(() => {
    if (wasViewerOpenRef.current && !isViewerOpen) resultListRef.current?.focus({ preventScroll: true })
    wasViewerOpenRef.current = isViewerOpen
  }, [isViewerOpen])

  /** Sends POST /api/index. SSE is already connected at this point. */
  const startIndex = useCallback(
    async (full = false) => {
      // Only a `done` event that arrives while this request is in flight may
      // count as "already finished"; one left over from an earlier run would
      // otherwise suppress the progress view of this run.
      donePendingRef.current = false
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full }),
      })
      if (res.status === 202) {
        // Drop the previous run's numbers so they cannot bleed into this one.
        setProgress(null)
        if (donePendingRef.current) {
          donePendingRef.current = false
          refetch()
        } else {
          setAppStatus('indexing')
        }
      } else if (res.status === 409) {
        // Someone else started a run in the meantime - follow that one.
        setAppStatus('indexing')
      }
    },
    [refetch],
  )

  const handleReindexChoice = useCallback(
    (full) => {
      setReindexOpen(false)
      setSelectedResult(null)
      startIndex(full)
    },
    [startIndex],
  )

  const handleOpen = useCallback((result) => {
    setSelectedResult(result)
  }, [])

  const closeViewer = useCallback(() => setSelectedResult(null), [])

  const clearQuery = useCallback(() => {
    setQuery('')
    searchBoxRef.current?.focus()
  }, [setQuery])

  // Words to highlight in the preview. The Query builder's words come from the
  // marked hits in each result's snippet instead.
  const highlight = useMemo(
    () => (tab === 'search' ? { terms: query.split(/[^\p{L}\p{N}]+/u).filter(Boolean), prefix: !exact } : undefined),
    [tab, query, exact],
  )

  const hasQuery = query.trim().length > 0
  const showSearchBox = tab === 'search' || !isReady
  const showTips = isReady && tab === 'search' && !hasQuery
  // "No results" only once the answer for the current query is in, not while the debounce is still running.
  const showResults = isReady && (results.length > 0 || (hasQuery && !searching))

  return (
    <>
      <Header
        appStatus={appStatus}
        fileCount={fileCount}
        percent={progress?.percent}
        onReindex={() => setReindexOpen(true)}
      />
      <main className={`app-main${isViewerOpen ? ' app-main--wide' : ''}`}>
        <h1 className="sr-only">nanosearch, full-text search for your documents</h1>

        {isViewerOpen ? (
          <DocumentViewer
            result={selectedResult}
            results={results}
            onSelect={setSelectedResult}
            onBack={closeViewer}
            highlight={highlight}
          />
        ) : (
          <>
            <section className="search-section" aria-label="Search">
              {isReady && (
                <div className="search-toolbar">
                  <div className="segmented segmented--mode" role="group" aria-label="Search mode">
                    <button
                      type="button"
                      className="segmented-option"
                      aria-pressed={tab === 'search'}
                      onClick={() => handleTabChange('search')}
                    >
                      <SearchIcon size={15} strokeWidth={2.4} />
                      Search
                    </button>
                    <button
                      type="button"
                      className="segmented-option"
                      aria-pressed={tab === 'extended'}
                      onClick={() => handleTabChange('extended')}
                    >
                      <SlidersIcon size={15} strokeWidth={2.4} />
                      Query builder
                    </button>
                  </div>
                  {tab === 'search' && (
                    <span className="shortcut-hint">
                      Press <kbd>/</kbd> to search
                    </span>
                  )}
                </div>
              )}

              {showSearchBox && (
                <>
                  <SearchBox
                    ref={searchBoxRef}
                    value={query}
                    onChange={setQuery}
                    disabled={!isReady}
                    placeholder={PLACEHOLDERS[appStatus]}
                    onArrowDown={() => resultListRef.current?.focus({ preventScroll: true })}
                    onEscape={clearQuery}
                  />
                  {isReady && (
                    <div className="search-options">
                      <p className="search-hint">
                        {exact ? (
                          <>
                            Whole words only: <code>doc</code> no longer finds <code>documents</code>.
                          </>
                        ) : (
                          <>
                            Prefix matching is on: <code>doc</code> also finds <code>documents</code>. Every word has to
                            appear.
                          </>
                        )}
                      </p>
                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          className="switch-input"
                          checked={exact}
                          onChange={(e) => setExact(e.target.checked)}
                        />
                        Exact match
                      </label>
                    </div>
                  )}
                </>
              )}

              {tab === 'extended' && isReady && <QueryBuilder onSearch={searchRaw} />}
            </section>

            {appStatus === 'no-index' && <StatusBanner onCreate={() => startIndex(false)} />}
            {isIndexing && <ProgressOverlay {...progress} />}
            {showTips && <SearchTips onOpenBuilder={() => handleTabChange('extended')} />}

            {showResults && (
              <div className="results">
                {results.length > 0 && (
                  <div className="results-header">
                    <h2 className="results-title">
                      {results.length} {results.length === 1 ? 'result' : 'results'}
                      {tab === 'search' && <span className="results-query"> for “{query.trim()}”</span>}
                    </h2>
                    <span className="results-meta">
                      {results.length >= RESULT_LIMIT
                        ? `Showing the best ${RESULT_LIMIT}. Add words to narrow it down.`
                        : 'Best match first'}
                    </span>
                  </div>
                )}
                <ResultList
                  results={results}
                  onOpen={handleOpen}
                  listRef={resultListRef}
                  onFocusSearchBox={() => searchBoxRef.current?.focus()}
                  onEscape={clearQuery}
                />
              </div>
            )}
          </>
        )}

        {reindexOpen && <ReindexDialog onChoice={handleReindexChoice} onClose={() => setReindexOpen(false)} />}
      </main>
      <Footer />
    </>
  )
}
