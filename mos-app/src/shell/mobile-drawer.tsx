import { useEffect, useRef, useCallback } from 'react'
import { RailNav } from './rail-nav'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  /** Called to return focus to the opener (hamburger button) on close. */
  focusOpener?: () => void
}

/**
 * Mobile navigation drawer with focus trap, Esc close, scrim dismiss.
 * FR-018/019, AC-014.
 */
export function MobileDrawer({ open, onClose, focusOpener }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const closeAndReturn = useCallback(() => {
    // Return focus to opener before closing so focus isn't lost when dialog unmounts
    focusOpener?.()
    onClose()
  }, [onClose, focusOpener])

  // Collect all focusable elements inside the panel
  const getFocusables = useCallback((): HTMLElement[] => {
    if (!panelRef.current) return []
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
  }, [])

  // Focus trap + Esc close
  useEffect(() => {
    if (!open) return

    // Focus first focusable item on open
    const focusables = getFocusables()
    if (focusables.length > 0) {
      focusables[0].focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndReturn()
        return
      }

      if (e.key === 'Tab') {
        const focusables = getFocusables()
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          // Shift+Tab: if on first, wrap to last
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          // Tab: if on last, wrap to first
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, closeAndReturn, getFocusables])

  if (!open) return null

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 bg-foreground/40 z-40"
        aria-hidden="true"
        onClick={closeAndReturn}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Primary navigation"
        className="fixed inset-y-0 left-0 bg-secondary flex flex-col z-50"
        style={{ width: 'var(--rail-w)' }}
      >
        <RailNav onNavigate={onClose} />
      </div>
    </>
  )
}
