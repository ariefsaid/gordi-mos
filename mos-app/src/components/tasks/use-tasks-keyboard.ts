import { useState, useEffect, useRef, useCallback } from 'react'

export type UseTasksKeyboardArgs = {
  /** Number of rows the cursor can move across. */
  rowCount: number
  /** When false, no key is handled (e.g. focus is outside the table region). */
  enabled: boolean
  /** Open the row at this index (Enter / o). */
  onOpen: (index: number) => void
  /** Close the drawer (Esc) — fires even while a field has focus. */
  onClose: () => void
  /** Open the create drawer (n). */
  onNew: () => void
  /** Toggle expand ⇄ split (e). */
  onExpand: () => void
}

export type UseTasksKeyboardResult = {
  /** Current keyboard cursor row index; -1 when nothing is focused yet. */
  cursor: number
  /** Lets the host sync the cursor (e.g. to the open/selected row). */
  setCursor: (index: number) => void
}

function isTypingTarget(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  return false
}

/**
 * The Tasks keyboard layer (OD-P3-4, AC-109): j/k move a row cursor, Enter/o
 * open the cursor row, Esc closes the drawer, n opens create, e toggles expand.
 *
 * Coexists with native Tab order — these never replace Tab. All single-letter
 * hotkeys are SUPPRESSED while a text input/textarea/select (or contentEditable)
 * has focus, so typing "n" in a field never opens a new task; Esc always works.
 */
export function useTasksKeyboard(args: UseTasksKeyboardArgs): UseTasksKeyboardResult {
  const { rowCount, enabled, onOpen, onClose, onNew, onExpand } = args
  const [cursor, setCursorState] = useState(-1)

  // Keep the latest callbacks/values in a ref so the window listener is stable.
  const ref = useRef({ rowCount, onOpen, onClose, onNew, onExpand, cursor })
  ref.current = { rowCount, onOpen, onClose, onNew, onExpand, cursor }

  const setCursor = useCallback((index: number) => setCursorState(index), [])

  // Clamp the cursor if the list shrinks below it.
  useEffect(() => {
    setCursorState(c => (c >= rowCount ? rowCount - 1 : c))
  }, [rowCount])

  useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent) {
      const { rowCount: rc, onOpen: open, onClose: close, onNew: nw, onExpand: exp, cursor: cur } = ref.current

      // Esc always works (even from a field) — releases the drawer.
      if (e.key === 'Escape') { close(); return }

      // Single-letter hotkeys are suppressed while typing.
      if (isTypingTarget()) return
      // Ignore when a modifier is held (let native shortcuts through).
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'j':
          if (rc <= 0) return
          e.preventDefault()
          setCursorState(c => Math.min(c < 0 ? 0 : c + 1, rc - 1))
          break
        case 'k':
          if (rc <= 0) return
          e.preventDefault()
          setCursorState(c => Math.max(c <= 0 ? 0 : c - 1, 0))
          break
        case 'Enter':
        case 'o': {
          if (rc <= 0) return
          e.preventDefault()
          const idx = cur < 0 ? 0 : cur
          open(idx)
          break
        }
        case 'n':
          e.preventDefault()
          nw()
          break
        case 'e':
          e.preventDefault()
          exp()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])

  return { cursor, setCursor }
}
