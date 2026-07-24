import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * The SHARED collection keyboard layer (GAP-9 / OD-REDESIGN-91 #14). Promoted out of the
 * Tasks-only `use-tasks-keyboard` so EVERY RecordCollection table inherits the same j/k row
 * cursor — Tasks, Signals, and any future engine table walk rows identically.
 *
 * Contract: j/k move a row cursor across `rowCount` rows, Enter/o open the cursor row, Esc runs
 * the optional `onClose` (a drawer close), n runs the optional `onNew` (open create). Collections
 * that own neither simply omit those callbacks and inherit the j/k/Enter core.
 *
 * Coexists with native Tab order — it never replaces Tab. All single-letter hotkeys are SUPPRESSED
 * while a text input/textarea/select (or contentEditable) has focus, so typing in a field never
 * triggers a hotkey.
 *
 * Escape single-path (D-B3/D-F1, RULED I2 — the gating carried over verbatim from the merged
 * use-tasks-keyboard work): the window Escape stands down while an overlay session is active (the
 * panel host owns the guarded close) and while a field has focus (the field owns its own Escape,
 * I5 isolation). It fires `onClose` only when the table region itself would otherwise swallow it.
 */
export type UseCollectionKeyboardArgs = {
  /** Number of rows the cursor can move across. */
  rowCount: number
  /** When false, no key is handled (e.g. focus is outside the table region). */
  enabled: boolean
  /** Open the row at this index (Enter / o). */
  onOpen: (index: number) => void
  /**
   * Close the open drawer (Esc). Optional — omit for a collection with no drawer. NOT fired while
   * an overlay session is active (the overlay host owns the guarded Escape path — D-B3/D-F1) nor
   * while a field has focus (the field owns its own Escape — I5 field isolation).
   */
  onClose?: () => void
  /**
   * True while a shared overlay-host session is live. Gates the window Escape off so the host's
   * guarded close is the ONE Escape path — never a race between host.close and onClose.
   */
  overlayActive?: boolean
  /** Open the create surface (n). Optional — omit for a read-only collection. */
  onNew?: () => void
}

export type UseCollectionKeyboardResult = {
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

export function useCollectionKeyboard(args: UseCollectionKeyboardArgs): UseCollectionKeyboardResult {
  const { rowCount, enabled, onOpen, onClose, onNew, overlayActive = false } = args
  const [cursor, setCursorState] = useState(-1)

  // Keep the latest callbacks/values in a ref so the window listener is stable.
  const ref = useRef({ rowCount, onOpen, onClose, onNew, cursor, overlayActive })
  ref.current = { rowCount, onOpen, onClose, onNew, cursor, overlayActive }

  const setCursor = useCallback((index: number) => setCursorState(index), [])

  // Clamp the cursor if the list shrinks below it.
  useEffect(() => {
    setCursorState(c => (c >= rowCount ? rowCount - 1 : c))
  }, [rowCount])

  useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent) {
      const { rowCount: rc, onOpen: open, onClose: close, onNew: nw, cursor: cur, overlayActive: overlay } = ref.current

      // Escape single-path (D-B3): while an overlay session is live the HOST owns the guarded
      // Escape; while a field has focus the FIELD owns its Escape (I5). The window layer only
      // closes the drawer when neither deeper owner is in play.
      if (e.key === 'Escape') {
        if (overlay || isTypingTarget()) return
        close?.()
        return
      }

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
          if (!nw) return
          e.preventDefault()
          nw()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])

  return { cursor, setCursor }
}
