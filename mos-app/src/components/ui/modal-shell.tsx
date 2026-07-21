import { useEffect, useRef, type ReactNode } from 'react'
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
}

const FOCUSABLE = [
  'button:not([disabled]):not([aria-disabled="true"])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableChildren(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  )
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
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    invokerRef.current = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog) return
      const [first] = focusableChildren(dialog)
      ;(first ?? dialog).focus()
    })

    return () => {
      cancelAnimationFrame(frame)
      invokerRef.current?.focus?.()
      invokerRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        if (!closeOnEscape) return
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = focusableChildren(dialog)
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

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
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
        className="modal-shell__surface"
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
