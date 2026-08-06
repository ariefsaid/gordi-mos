import { useState, useEffect, useCallback } from 'react'

/**
 * The command palette's opener mode (OD-REDESIGN-91 #15 / GAP-10, per OD-46). One registry, two
 * entry points:
 *  - 'search'   — the full palette (Recent · Actions · Navigate + record search). ⌘K + the
 *                 top-bar search trigger open this.
 *  - 'launcher' — the REDUCED create-set (the universal actions only) that the phone `+` opens;
 *                 typing still escalates to the shared search (OD-46 "More opens the full palette").
 */
export type CommandMenuMode = 'search' | 'launcher'

// Owns the command-palette open/close state + mode plus the global ⌘K / Ctrl+K hotkey (AC-K02).
// Mounted once at the shell level; the TopBar search trigger opens 'search', the phone `+`
// action-launcher opens 'launcher', and the menu calls setOpen(false) on close.
export function useCommandMenu(): {
  open: boolean
  mode: CommandMenuMode
  setOpen: (open: boolean) => void
  openWithMode: (mode: CommandMenuMode) => void
} {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CommandMenuMode>('search')

  const openWithMode = useCallback((next: CommandMenuMode) => {
    setMode(next)
    setOpen(true)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        // ⌘K is always the full palette — the keyboard is the search seam, never the reduced launcher.
        openWithMode('search')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [openWithMode])

  return { open, mode, setOpen, openWithMode }
}
