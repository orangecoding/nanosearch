/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useRef, useCallback } from 'react'

let _nextId = 1
const nextId = () => _nextId++

/**
 * Converts a list of conditions into an FTS5 MATCH expression.
 * Include terms are joined with the per-row AND/OR connector.
 * Exclude terms always become AND NOT regardless of their connector.
 * Returns an empty string when no valid include terms exist.
 * @param {Array<{ text: string, mode: 'include'|'exclude', connector: 'AND'|'OR' }>} conditions
 * @returns {string}
 */
function buildFtsExpression(conditions) {
  const parts = []
  let hasInclude = false

  for (const cond of conditions) {
    const clean = cond.text.trim().replace(/["'()*:^{}~-]/g, '')
    if (!clean) continue
    const term = `${clean}*`

    if (cond.mode === 'include') {
      parts.push(hasInclude ? `${cond.connector} ${term}` : term)
      hasInclude = true
    } else if (hasInclude) {
      // Exclude terms are always AND NOT - the connector is irrelevant
      parts.push(`AND NOT ${term}`)
    }
  }

  return parts.join(' ')
}

/**
 * Visual query builder for constructing FTS5 expressions without knowing the syntax.
 * Each condition has a mode (include/exclude) and a connector (AND/OR) shown between rows.
 * The built expression is debounced and passed to onSearch.
 * @param {{ onSearch: (ftsExpression: string) => void }} props
 */
export function QueryBuilder({ onSearch }) {
  const [conditions, setConditions] = useState([{ id: nextId(), text: '', mode: 'include', connector: 'AND' }])

  // Stable ref so the effect only re-runs when conditions change, not onSearch identity
  const onSearchRef = useRef(onSearch)
  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  useEffect(() => {
    const expression = buildFtsExpression(conditions)
    const timer = setTimeout(() => onSearchRef.current(expression), 300)
    return () => clearTimeout(timer)
  }, [conditions])

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { id: nextId(), text: '', mode: 'include', connector: 'AND' }])
  }, [])

  const removeCondition = useCallback((id) => {
    setConditions((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const update = useCallback((id, patch) => {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  return (
    <div className="qb">
      <div className="qb-conditions">
        {conditions.map((cond, idx) => (
          <div key={cond.id} className="qb-row-group">
            {idx > 0 && (
              <div className="qb-connector-row">
                <button
                  className={`qb-connector ${cond.connector === 'OR' ? 'qb-connector--or' : ''}`}
                  onClick={() => update(cond.id, { connector: cond.connector === 'AND' ? 'OR' : 'AND' })}
                  title="Click to toggle AND / OR"
                >
                  {cond.connector}
                </button>
              </div>
            )}
            <div className="qb-condition">
              <button
                className={`qb-mode ${cond.mode === 'exclude' ? 'qb-mode--exclude' : 'qb-mode--include'}`}
                onClick={() => update(cond.id, { mode: cond.mode === 'include' ? 'exclude' : 'include' })}
                title={
                  cond.mode === 'include'
                    ? 'Must contain - click to exclude instead'
                    : 'Must not contain - click to include instead'
                }
              >
                {cond.mode === 'include' ? '+' : '−'}
              </button>
              <input
                className="qb-input"
                type="text"
                placeholder={cond.mode === 'include' ? 'Word to include…' : 'Word to exclude…'}
                value={cond.text}
                onChange={(e) => update(cond.id, { text: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
              {conditions.length > 1 && (
                <button className="qb-remove" onClick={() => removeCondition(cond.id)} title="Remove this condition">
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="qb-add" onClick={addCondition}>
        + Add term
      </button>
    </div>
  )
}
