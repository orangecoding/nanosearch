/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { SearchIcon, XIcon } from './Icons.jsx'

/**
 * Controlled search input with a leading icon and a clear button.
 * Accepts a `ref` prop directly (React 19 — no forwardRef wrapper needed); it
 * points at the input element.
 * @param {{ value: string, onChange: (v: string) => void, disabled: boolean, placeholder: string, onArrowDown?: () => void, onEscape?: () => void, ref?: React.Ref }} props
 */
export function SearchBox({ value, onChange, disabled, placeholder, onArrowDown, onEscape, ref }) {
  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      onArrowDown?.()
    } else if (e.key === 'Escape') {
      onEscape?.()
    }
  }

  function handleClear() {
    onChange('')
    ref?.current?.focus()
  }

  return (
    <div className={`search-field${disabled ? ' search-field--disabled' : ''}`}>
      <SearchIcon size={20} className="search-field-icon" />
      <input
        ref={ref}
        type="search"
        role="searchbox"
        aria-label="Search your documents"
        className="search-box"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={handleKeyDown}
      />
      {value && !disabled && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={handleClear}>
          <XIcon size={18} />
        </button>
      )}
    </div>
  )
}
