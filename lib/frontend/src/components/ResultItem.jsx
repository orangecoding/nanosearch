/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Square badge with the file type, tinted per type so a list is easy to scan.
 * @param {{ type: string, small?: boolean }} props
 */
export function FileTile({ type, small = false }) {
  return <span className={`file-tile file-tile--${type}${small ? ' file-tile--small' : ''}`}>{type}</span>
}

/**
 * Renders a single search result with type tile, filename, path and highlighted snippet.
 * Uses dangerouslySetInnerHTML for the snippet to render FTS5 mark tags.
 * This is safe because the backend escapes the snippet and only adds the mark tags itself.
 * @param {{ result: object, focused: boolean, onClick: () => void }} props
 */
export function ResultItem({ result, focused, onClick }) {
  return (
    <li className={`result-item${focused ? ' focused' : ''}`} onClick={onClick}>
      <FileTile type={result.type} />
      <div className="result-body">
        <span className="result-filename">{result.filename}</span>
        <span className="result-path">{result.path}</span>
        <div className="result-snippet" dangerouslySetInnerHTML={{ __html: result.snippet }} />
      </div>
      {focused && (
        <span className="result-open-hint" aria-hidden="true">
          Preview <kbd>↵</kbd>
        </span>
      )}
    </li>
  )
}
