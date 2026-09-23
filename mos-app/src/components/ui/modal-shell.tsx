import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { focusableWithin } from '@/lib/focusable'
import './modal-shell.css'

export type ModalShellProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  role?: 'dialog' | 'alertdialog'
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  surface?: 'centered' | 'sheet'
  phoneMode?: 'centered' | 'fullscreen'
  className?: string
  /** Focus this element on open instead of the first focusable descendant. The ref is read at the
   * moment the dialog opens, so it works even when the dialog's own mount is gated behind an
   * async condition the caller doesn't control (e.g. an authority check) — the caller only needs
   * the target to already be in the DOM by the time `open` becomes true. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * The single interaction owner for centered/sheet dialogs.
 * Domain components supply content and dismissal policy; this shell owns focus,
 * keyboard, scrim, responsive geometry, and focus return.
 */
export function ModalShell({
  open,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  role = 'dialog',
  closeOnBackdrop = false,
  closeOnEscape = true,
  surface = 'centered',
  phoneMode = 'centered',
  className,
  initialFocusRef,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    invokerRef.current = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const preferred = initialFocusRef?.current
    if (preferred) {
      preferred.focus()
    } else if (dialog) {
      const [first] = focusableWithin(dialog)
      ;(first ?? dialog).focus()
    }

    return () => {
      invokerRef.current?.focus?.()
      invokerRef.current = null
    }
  }, [open, initialFocusRef])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        if (event.target instanceof Element && event.target.closest('[data-escape-layer="nested"]')) return
        if (!closeOnEscape) return
        event.preventDefault()
        // A modal owns Escape while it is open. Without this the key kept travelling to whatever
        // sat underneath: on the Café capture form the inline-edit primitive treats Escape as
        // discard-and-restore, so dismissing a dialog ALSO threw away the quantity behind it.
        // `preventDefault` alone does not help — that primitive does not consult defaultPrevented.
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = focusableWithin(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    // Capture phase: React delegates its own listeners to the app root, which is INSIDE document,
    // so a bubble-phase listener here runs AFTER every component handler and cannot stop them.
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [closeOnEscape, open])

  useEffect(() => {
    if (!open || phoneMode !== 'fullscreen' || typeof window.matchMedia !== 'function') return
    if (!window.matchMedia('(max-width: 640px)').matches) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open, phoneMode])

  if (!open) return null

  return (
    <div
      className="modal-shell__scrim scrim"
      data-testid="modal-shell-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={`modal-shell__surface${className ? ` ${className}` : ''}`}
        data-surface={surface}
        data-phone-mode={phoneMode}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
