/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MinusIcon, PlusIcon, ResetIcon, XIcon } from './Icons.jsx'

let _nextId = 1
const nextId = () => _nextId++

/**
 * @typedef {{ id: number, text: string, mode: 'include'|'exclude', connector: 'AND'|'OR' }} Condition
 */

/**
 * @param {'include'|'exclude'} mode
 * @returns {Condition}
 */
function newCondition(mode) {
  return { id: nextId(), text: '', mode, connector: 'AND' }
}

/**
 * Splits a row into the words that can match anything. Words without any
 * letter or digit would match nothing and are skipped.
 * @param {string} text
 * @returns {string[]}
 */
function searchableWords(text) {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
}

/**
 * Converts a list of conditions into an FTS5 MATCH expression.
 * Include terms are joined with the per-row AND/OR connector.
 * Exclude terms apply to the whole included part, whatever their position or connector.
 * Returns an empty string when no valid include terms exist.
 * @param {Condition[]} conditions
 * @returns {string}
 */
function buildFtsExpression(conditions) {
  const included = []
  const excluded = []

  for (const cond of conditions) {
    // Each word is quoted, so FTS5 reads it as plain text: punctuation and
    // operator words (AND, OR, NOT) cannot break the query.
    const words = searchableWords(cond.text).map((w) => `"${w.replace(/"/g, '')}"*`)
    if (words.length === 0) continue
    const term = words.length === 1 ? words[0] : `(${words.join(' AND ')})`

    if (cond.mode === 'include') {
      included.push(included.length === 0 ? term : `${cond.connector} ${term}`)
    } else {
      excluded.push(term)
    }
  }

  if (included.length === 0) return ''
  const include = included.join(' ')
  if (excluded.length === 0) return include
  // FTS5 has no "AND NOT" (it is a syntax error) and binds NOT tighter than
  // AND and OR, so the included part needs its own parentheses for an
  // exclusion to apply to all of it.
  return `${included.length > 1 ? `(${include})` : include} NOT ${excluded.join(' NOT ')}`
}

/**
 * Describes the same query as buildFtsExpression in plain words, so the user
 * can check what AND, OR and the excluded rows add up to.
 * @param {Condition[]} conditions
 * @returns {string}
 */
function describeQuery(conditions) {
  const included = []
  const excluded = []

  for (const cond of conditions) {
    const words = searchableWords(cond.text)
    if (words.length === 0) continue
    const phrase = `“${words.join(' ')}”`
    if (cond.mode === 'include') {
      included.push(included.length === 0 ? phrase : `${cond.connector === 'OR' ? ' or ' : ' and '}${phrase}`)
    } else {
      excluded.push(phrase)
    }
  }

  if (included.length === 0) return 'Add a word to include to start searching.'
  const but = excluded.length > 0 ? `, but not ${excluded.join(' or ')}` : ''
  return `Files that contain ${included.join('')}${but}.`
}

/**
 * Visual query builder for constructing FTS5 expressions without knowing the syntax.
 * Each row either has to be contained or is excluded; contained rows are joined
 * with AND or OR. The built expression is debounced and passed to onSearch.
 * @param {{ onSearch: (ftsExpression: string) => void }} props
 */
export function QueryBuilder({ onSearch }) {
  const [conditions, setConditions] = useState(() => [newCondition('include')])
  // Row whose input gets focus when it mounts: the one just added, never the initial one.
  const [focusId, setFocusId] = useState(null)

  const expression = useMemo(() => buildFtsExpression(conditions), [conditions])
  const sentence = useMemo(() => describeQuery(conditions), [conditions])

  // Stable ref so the effect only re-runs when the expression changes, not onSearch identity
  const onSearchRef = useRef(onSearch)
  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  useEffect(() => {
    const timer = setTimeout(() => onSearchRef.current(expression), 300)
    return () => clearTimeout(timer)
  }, [expression])

  const addCondition = useCallback((mode) => {
    const cond = newCondition(mode)
    setFocusId(cond.id)
    setConditions((prev) => [...prev, cond])
  }, [])

  const removeCondition = useCallback((id) => {
    setConditions((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const reset = useCallback(() => {
    const cond = newCondition('include')
    setFocusId(cond.id)
    setConditions([cond])
  }, [])

  const update = useCallback((id, patch) => {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  return (
    <section className="qb" aria-labelledby="qb-title">
      <div className="qb-head">
        <div>
          <h2 id="qb-title" className="qb-title">
            Build a query
          </h2>
          <p className="qb-intro">
            Words in one row must all appear. Join rows with AND or OR. Excluded words always apply.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={reset}>
          <ResetIcon size={15} />
          Start over
        </button>
      </div>

      <ol className="qb-conditions" role="list">
        {conditions.map((cond, idx) => {
          const row = idx + 1
          const include = cond.mode === 'include'
          return (
            <li key={cond.id}>
              {idx > 0 && (
                <div className="qb-connector-row">
                  <span className="qb-rail" aria-hidden="true" />
                  {include ? (
                    <div
                      className="segmented segmented--sm"
                      role="group"
                      aria-label={`How row ${row} joins the rows above`}
                    >
                      <button
                        type="button"
                        className="segmented-option"
                        aria-pressed={cond.connector === 'AND'}
                        onClick={() => update(cond.id, { connector: 'AND' })}
                      >
                        AND
                      </button>
                      <button
                        type="button"
                        className="segmented-option segmented-option--accent"
                        aria-pressed={cond.connector === 'OR'}
                        onClick={() => update(cond.id, { connector: 'OR' })}
                      >
                        OR
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="qb-fixed-connector">NOT</span>
                      <span className="qb-connector-note">excluded words always apply</span>
                    </>
                  )}
                </div>
              )}
              <div className="qb-condition">
                <div className="segmented" role="group" aria-label={`Row ${row} type`}>
                  <button
                    type="button"
                    className="segmented-option"
                    aria-pressed={include}
                    onClick={() => update(cond.id, { mode: 'include' })}
                  >
                    <PlusIcon size={14} strokeWidth={2.8} className="icon-include" />
                    Contains
                  </button>
                  <button
                    type="button"
                    className="segmented-option"
                    aria-pressed={!include}
                    onClick={() => update(cond.id, { mode: 'exclude' })}
                  >
                    <MinusIcon size={14} strokeWidth={2.8} className="icon-exclude" />
                    Excludes
                  </button>
                </div>
                <input
                  className="qb-input"
                  type="text"
                  aria-label={`${include ? 'Word to include' : 'Word to exclude'}, row ${row}`}
                  placeholder={include ? 'Word to include…' : 'Word to exclude…'}
                  value={cond.text}
                  onChange={(e) => update(cond.id, { text: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus={cond.id === focusId}
                />
                {conditions.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label={`Remove row ${row}`}
                    onClick={() => removeCondition(cond.id)}
                  >
                    <XIcon size={16} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="qb-add-row">
        <button type="button" className="btn btn--dashed" onClick={() => addCondition('include')}>
          <PlusIcon size={14} strokeWidth={2.6} className="icon-include" />
          Add word
        </button>
        <button type="button" className="btn btn--dashed" onClick={() => addCondition('exclude')}>
          <MinusIcon size={14} strokeWidth={2.6} className="icon-exclude" />
          Exclude word
        </button>
      </div>

      <div className="qb-summary">
        <span className="eyebrow">You are searching for</span>
        <p className="qb-sentence">{sentence}</p>
        {expression && <code className="qb-expression">{expression}</code>}
      </div>
    </section>
  )
}
