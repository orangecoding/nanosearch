/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { SearchBox } from './components/SearchBox.jsx'
import { ResultList } from './components/ResultList.jsx'
import { ProgressOverlay } from './components/ProgressOverlay.jsx'
import { StatusBanner } from './components/StatusBanner.jsx'
import { QueryBuilder } from './components/QueryBuilder.jsx'
import { DocumentViewer } from './components/DocumentViewer.jsx'
import { useIndexStatus } from './hooks/useIndexStatus.js'
import { useSSE } from './hooks/useSSE.js'
import { useSearch } from './hooks/useSearch.js'

/**
 * @typedef {'loading' | 'no-index' | 'indexing' | 'ready'} AppStatus
 */

const TAB_DESCRIPTIONS = {
  search: 'Searches all indexed files by keyword. Prefix matching enabled.',
  extended: 'Build complex queries with include/exclude terms and AND/OR logic.',
}

/**
 * Magnifying glass icon rendered as inline SVG.
 */
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

/**
 * Sticky top header with logo and app name.
 */
function Header() {
  return (
    <header className="app-header">
      <div className="logo">
        <div className="logo-icon">
          <SearchIcon />
        </div>
        <div className="logo-text">
          <div className="logo-name">
            <span className="logo-name-base">nano</span>
            <span className="logo-name-accent">search</span>
          </div>
          <span className="logo-subtitle">full-text search</span>
        </div>
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
      <span>
        Made with <span className="footer-heart">&#10084;</span> by{' '}
        <a href="https://github.com/orangecoding" target="_blank" rel="noopener noreferrer">
          Christian Kellner
        </a>
      </span>
    </footer>
  )
}

/**
 * Dialog shown when the user clicks Re-Index.
 * Lets them choose between an incremental update and a full reset.
 * @param {{ onChoice: (full: boolean) => void, onClose: () => void }} props
 */
function ReindexDialog({ onChoice, onClose }) {
  return (
    <dialog open className="reindex-dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="reindex-dialog-inner">
        <h2 className="reindex-title">Re-Index</h2>
        <p className="reindex-subtitle">How would you like to update your index?</p>
        <div className="reindex-options">
          <button className="reindex-option" onClick={() => onChoice(false)}>
            <span className="reindex-option-name">Update</span>
            <span className="reindex-option-desc">
              Keep the existing index and only process new or changed files. Fast.
            </span>
          </button>
          <button className="reindex-option reindex-option--full" onClick={() => onChoice(true)}>
            <span className="reindex-option-name">Full Reset</span>
            <span className="reindex-option-desc">
              Discard the existing index and rebuild from scratch. Use this after changing <code>SEARCH_DIRS</code>.
            </span>
          </button>
        </div>
        <button className="reindex-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

/**
 * Root application component.
 * Manages the three-state machine: no-index, indexing, ready.
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

  const { indexed, loading: statusLoading, refetch } = useIndexStatus()
  const { results, setResults, query, setQuery, exact, setExact, searchRaw } = useSearch()

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
        setProgress(event)
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

  /** Sends POST /api/index. SSE is already connected at this point. */
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
      } else {
        donePendingRef.current = false
      }
    },
    [refetch],
  )

  const handleIndexClick = useCallback(() => {
    if (appStatus === 'ready') {
      setReindexOpen(true)
    } else {
      startIndex(false)
    }
  }, [appStatus, startIndex])

  const handleReindexChoice = useCallback(
    (full) => {
      setReindexOpen(false)
      startIndex(full)
    },
    [startIndex],
  )

  const handleOpen = useCallback((result) => {
    setSelectedResult(result)
  }, [])

  const isIndexing = appStatus === 'indexing'
  const isReady = appStatus === 'ready'
  const isViewerOpen = selectedResult !== null
  const showResults = !isViewerOpen && isReady && (query.trim().length > 0 || results.length > 0)

  return (
    <>
      <Header />
      <main className="app-main">
        <div className="search-section">
          <div className="search-section-header">
            <nav className="tab-bar">
              <button
                className={`tab ${tab === 'search' ? 'tab--active' : ''}`}
                onClick={() => handleTabChange('search')}
              >
                Search
              </button>
              <button
                className={`tab ${tab === 'extended' ? 'tab--active' : ''}`}
                onClick={() => handleTabChange('extended')}
                disabled={!isReady}
              >
                Extended
              </button>
            </nav>
            <button className="index-btn" onClick={handleIndexClick} disabled={isIndexing || appStatus === 'loading'}>
              {isIndexing ? 'Indexing...' : isReady ? 'Re-Index' : 'Create Index'}
            </button>
          </div>

          {!isViewerOpen && (
            <>
              <p className="tab-description">{TAB_DESCRIPTIONS[tab]}</p>

              {tab === 'search' && (
                <>
                  <div className="search-row">
                    <SearchBox
                      ref={searchBoxRef}
                      value={query}
                      onChange={setQuery}
                      disabled={!isReady}
                      placeholder={
                        isReady ? 'Search your documents...' : 'No index yet - create one to start searching'
                      }
                      onArrowDown={() => resultListRef.current?.focus({ preventScroll: true })}
                      onEscape={() => {
                        setQuery('')
                        searchBoxRef.current?.focus()
                      }}
                    />
                  </div>
                  {isReady && (
                    <label className="exact-match-label">
                      <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} />
                      Exact match
                    </label>
                  )}
                </>
              )}

              {tab === 'extended' && isReady && <QueryBuilder onSearch={searchRaw} />}
            </>
          )}
        </div>

        {appStatus === 'no-index' && <StatusBanner />}
        {isIndexing && <ProgressOverlay {...progress} />}

        {isViewerOpen && <DocumentViewer result={selectedResult} onBack={() => setSelectedResult(null)} />}

        {showResults && (
          <ResultList
            results={results}
            onOpen={handleOpen}
            listRef={resultListRef}
            onFocusSearchBox={() => searchBoxRef.current?.focus()}
            onEscape={() => {
              setQuery('')
              searchBoxRef.current?.focus()
            }}
          />
        )}

        {reindexOpen && <ReindexDialog onChoice={handleReindexChoice} onClose={() => setReindexOpen(false)} />}
      </main>
      <Footer />
    </>
  )
}
