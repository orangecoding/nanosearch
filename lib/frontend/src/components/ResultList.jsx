/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useCallback } from 'react'
import { ResultItem } from './ResultItem.jsx'

/**
 * Renders a keyboard-navigable list of search results.
 * Arrow up/down moves focus. Enter opens the focused result.
 * Arrow up on the first item returns focus to the search box via onFocusSearchBox.
 * Escape clears results and returns focus via onEscape.
 * @param {{ results: object[], onOpen: (result: object) => void, listRef?: React.Ref, onFocusSearchBox?: () => void, onEscape?: () => void }} props
 */
export function ResultList({ results, onOpen, listRef, onFocusSearchBox, onEscape }) {
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const handleFocus = useCallback(() => {
    setFocusedIndex((i) => (i === -1 ? 0 : i))
  }, [])

  const handleKeyDown = useCallback(
    (e) => {
      if (results.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (focusedIndex <= 0) {
          setFocusedIndex(-1)
          onFocusSearchBox?.()
        } else {
          setFocusedIndex((i) => i - 1)
        }
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        onOpen(results[focusedIndex])
      } else if (e.key === 'Escape') {
        setFocusedIndex(-1)
        onEscape?.()
      }
    },
    [results, focusedIndex, onOpen, onFocusSearchBox, onEscape],
  )

  if (results.length === 0) {
    return <p className="no-results">No results found.</p>
  }

  return (
    <ul className="result-list" role="list" tabIndex={0} ref={listRef} onFocus={handleFocus} onKeyDown={handleKeyDown}>
      {results.map((result, i) => (
        <ResultItem key={result.path} result={result} focused={i === focusedIndex} onClick={() => onOpen(result)} />
      ))}
    </ul>
  )
}
