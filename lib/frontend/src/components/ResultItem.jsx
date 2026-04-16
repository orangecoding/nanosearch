/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Renders a single search result with filename, path, type badge, and highlighted snippet.
 * Uses dangerouslySetInnerHTML for the snippet to render FTS5 mark tags.
 * This is safe because snippet content is generated server-side from indexed local files.
 * @param {{ result: object, focused: boolean, onClick: () => void }} props
 */
export function ResultItem({ result, focused, onClick }) {
  return (
    <li className={`result-item${focused ? ' focused' : ''}`} onClick={onClick}>
      <div className="result-header">
        <span className="result-filename">{result.filename}</span>
        <span className="result-type-badge">{result.type}</span>
      </div>
      <div className="result-path">{result.path}</div>
      <div className="result-snippet" dangerouslySetInnerHTML={{ __html: result.snippet }} />
    </li>
  )
}
