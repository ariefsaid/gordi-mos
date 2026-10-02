import { useCallback, useEffect, useRef } from 'react'

/**
 * Closed-picker type-ahead (DD-MVP-2 / #1192): typing a letter on a focused, closed picker
 * trigger selects the next option starting with that text — native-select grammar — shared by
 * the Picker and Select primitives so every call site inherits it once.
 *
 * Matching follows the Radix Select grammar: the scan starts after the current selection and
 * wraps; a single-letter (or repeated-letter) search never re-picks the selection, so repeated
 * presses cycle through the matches; a short buffer carries a multi-letter prefix.
 */

export const TYPEAHEAD_BUFFER_MS = 1000

export type TypeaheadOption = {
  value: string
  label: string
  disabled?: boolean
}

// The value of the next enabled option whose label starts with `search`, scanning forward from
// (wrapping past) `currentValue`; undefined when nothing matches.
export function nextTypeaheadMatch(
  options: readonly TypeaheadOption[],
  currentValue: string | undefined,
  search: string,
): string | undefined {
  const enabled = options.filter((option) => !option.disabled)
  if (enabled.length === 0 || search === '') return undefined
  const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0])
  const needle = (isRepeated ? search[0] : search).toLocaleLowerCase()
  const current = enabled.find((option) => option.value === currentValue)
  const start = current ? enabled.indexOf(current) + 1 : 0
  const wrapped = [...enabled.slice(start), ...enabled.slice(0, start)]
  const candidates = needle.length === 1 ? wrapped.filter((option) => option !== current) : wrapped
  const match = candidates.find((option) => option.label.toLocaleLowerCase().startsWith(needle))
  return match && match !== current ? match.value : undefined
}

/**
 * The keystroke buffer behind the type-ahead: each pushed key returns the accumulated search
 * string, which clears itself after TYPEAHEAD_BUFFER_MS of inactivity.
 */
export function useTypeaheadBuffer() {
  const searchRef = useRef('')
  const timerRef = useRef(0)
  const clear = useCallback(() => {
    searchRef.current = ''
    window.clearTimeout(timerRef.current)
  }, [])
  useEffect(() => clear, [clear])
  const push = useCallback((key: string) => {
    const search = searchRef.current + key
    searchRef.current = search
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(clear, TYPEAHEAD_BUFFER_MS)
    return search
  }, [clear])
  const peek = useCallback(() => searchRef.current, [])
  return { push, peek, clear }
}

/** True when a keydown on a closed trigger should feed the type-ahead (a bare printable key). */
export function isTypeaheadKey(event: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean {
  return !event.ctrlKey && !event.altKey && !event.metaKey && event.key.length === 1
}
