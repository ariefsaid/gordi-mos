import { useState, useEffect } from 'react'

/**
 * Owns the command-palette open/close state plus the global ⌘K / Ctrl+K hotkey
 * (AC-K02). Mounted once at the shell level; the TopBar trigger calls setOpen(true)
 * and the menu calls setOpen(false) on close.
 */
export function useCommandMenu(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return { open, setOpen }
}
