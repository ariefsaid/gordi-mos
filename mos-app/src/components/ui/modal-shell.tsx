import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { focusableWithin } from '@/lib/focusable'
import { useEscapeLayer } from '@/lib/use-escape-layer'
import { OverlayPortal } from './overlay-portal'
import { useFocusTrap } from './use-focus-trap'
import { useInertAppRoot } from './use-inert-app-root'
import './modal-shell.css'

const ModalShellPortalContext = createContext(false)

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
  /** Where focus lands on close when nothing focused opened the dialog (a global shortcut leaves
   * the invoker at <body>). A real invoker always wins. */
  returnFocusRef?: RefObject<HTMLElement | null>
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
  returnFocusRef,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const invokerRef = useRef<HTMLElement | null>(null)
  const alreadyInModal = useContext(ModalShellPortalContext)
  useInertAppRoot(open)
  useFocusTrap(dialogRef, open)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEscapeLayer(open, dialogRef, () => onCloseRef.current(), { closeOnEscape })

  useEffect(() => {
    if (!open) return
    invokerRef.current = document.activeElement as HTMLElement | null
    const returnTarget = returnFocusRef?.current
    const dialog = dialogRef.current
    const preferred = initialFocusRef?.current
    if (preferred) {
      preferred.focus()
    } else if (dialog) {
      const [first] = focusableWithin(dialog)
      ;(first ?? dialog).focus()
    }

    return () => {
      const invoker = invokerRef.current
      const target = invoker && invoker !== document.body ? invoker : returnTarget
      target?.focus?.()
      invokerRef.current = null
    }
  }, [open, initialFocusRef, returnFocusRef])

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

  const modal = (
    <ModalShellPortalContext.Provider value={true}>
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
    </ModalShellPortalContext.Provider>
  )

  return alreadyInModal ? modal : <OverlayPortal>{modal}</OverlayPortal>
}
