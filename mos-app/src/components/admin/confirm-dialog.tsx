// ConfirmDialog — generalized from ConfirmArchive (design-plan §4.7).
// Gates destructive/consequential actions behind an explicit confirm step.
// Non-destructive actions (enable, restore) need no confirm — use directly.
//
// States: idle → submitting (onConfirm async) → success (caller closes) / error (inline alert, retry).
// a11y: role=dialog aria-modal, aria-labelledby heading, focus trap (Cancel auto-focuses — never
//   auto-focus the destructive action button), Esc → onCancel.

import { useState, useId, useRef, useEffect } from 'react'
import { ErrorState } from '@/components/ui/state-kit'

export interface ConfirmDialogProps {
  open: boolean
  /** Dialog heading — e.g. "Reset password for Budi Santoso?" */
  title: string
  /** Consequence body — plain language about what happens. */
  body: string
  /** Action button label — e.g. "Reset password", "Disable", "Archive" */
  confirmLabel: string
  /**
   * Button tone for the confirm button.
   * 'primary' = reversible action (reset, disable — following design-plan §4.7 amber convention).
   * 'destructive' = Archive (closest to irreversible in this slice).
   * Default: 'primary'.
   */
  tone?: 'primary' | 'destructive'
  /** Async action fired on confirm click. Throw to surface an error state. */
  onConfirm: () => Promise<void>
  /** Called on Cancel or Esc. */
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  // Capture invoker for focus return
  const invokerRef = useRef<HTMLElement | null>(null)

  // Capture the active element before open, return it on close
  useEffect(() => {
    if (open) {
      invokerRef.current = document.activeElement as HTMLElement | null
      // Auto-focus Cancel (safe default — never auto-focus the action button)
      requestAnimationFrame(() => {
        cancelBtnRef.current?.focus()
      })
    } else {
      invokerRef.current?.focus?.()
    }
  }, [open])

  // Esc → cancel; Tab trap
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const FOCUSABLE =
        'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  async function handleConfirm() {
    setError('')
    setBusy(true)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
    // On success the caller closes (setBusy(false) not needed; component unmounts)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--scrim)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-lg p-6"
        style={{
          background: 'var(--card)',
          boxShadow: 'var(--shadow-overlay)',
          border: '1px solid var(--input)',
          borderRadius: 'var(--radius)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          className="heading font-semibold mb-2"
          style={{ color: 'var(--foreground)' }}
        >
          {title}
        </h2>
        <p
          className="text-sm mb-5"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {body}
        </p>

        {error && (
          <div className="mb-4">
            <ErrorState message={error} />
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {/* Use native button with CSS class so we can attach a ref for auto-focus */}
          <button
            ref={cancelBtnRef}
            type="button"
            className="btn btn-outline"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${tone === 'destructive' ? 'btn-destructive' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
