/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { extract as extractText } from './text.js'

/** Groups that hold document metadata (fonts, colors, styles), not text. */
const NON_TEXT_GROUP = /^\{\\(?:\*|(?:fonttbl|colortbl|stylesheet|info|pict|header|footer|footnote)\b)/

/** Control words that stand for whitespace in the rendered document. */
const WHITESPACE_WORD = /\\(?:par|line|tab|page|sect|row|cell)\b ?/g

const PARKED = { '\\': '\u0001', '{': '\u0002', '}': '\u0003' }
const UNPARKED = { '\u0001': '\\', '\u0002': '{', '\u0003': '}' }

/**
 * Removes every brace group that carries no document text, including nested
 * groups inside it.
 * @param {string} rtf
 * @returns {string}
 */
function dropNonTextGroups(rtf) {
  let out = ''
  let i = 0
  while (i < rtf.length) {
    if (rtf[i] === '{' && rtf[i - 1] !== '\\' && NON_TEXT_GROUP.test(rtf.slice(i, i + 16))) {
      let depth = 0
      for (; i < rtf.length; i++) {
        if (rtf[i] === '\\') i++
        else if (rtf[i] === '{') depth++
        else if (rtf[i] === '}' && --depth === 0) break
      }
      i++
      continue
    }
    out += rtf[i++]
  }
  return out
}

/**
 * Extracts the readable text of an RTF document. RTF is plain text interleaved
 * with control words, which would otherwise end up in the index and in every
 * search snippet. This is a text extraction for search, not a renderer.
 * @param {string} filePath - Absolute path to the RTF file.
 * @returns {Promise<string>}
 */
export async function extract(filePath) {
  return (
    dropNonTextGroups(await extractText(filePath))
      // Park escaped literals (\\ \{ \}) so the clean-up below leaves them alone.
      .replace(/\\([\\{}])/g, (_, c) => PARKED[c])
      .replace(WHITESPACE_WORD, '\n')
      // \uN is a (signed) UTF-16 code unit, followed by one fallback character.
      .replace(/\\u(-?\d+) ?(?:\\'[0-9a-f]{2}|[^\\{}])?/gi, (_, code) => String.fromCharCode(Number(code) & 0xffff))
      .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\[a-z]+-?\d* ?|\\[^a-z]|[{}]/gi, '')
      // eslint-disable-next-line no-control-regex -- the parking markers are control characters by design
      .replace(/[\u0001-\u0003]/g, (c) => UNPARKED[c])
      .replace(/[ \t]+/g, ' ')
      .trim()
  )
}
