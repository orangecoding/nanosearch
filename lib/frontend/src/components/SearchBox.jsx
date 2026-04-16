/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Controlled search input.
 * Accepts a `ref` prop directly (React 19 — no forwardRef wrapper needed).
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

  return (
    <input
      ref={ref}
      type="search"
      role="searchbox"
      className="search-box"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      onKeyDown={handleKeyDown}
    />
  )
}
