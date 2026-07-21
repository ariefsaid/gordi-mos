// ConfirmDialog — the ONE centered-modal confirm primitive (cohesion-debt 2026-07-19,
// item #4). Promoted from components/admin/confirm-dialog.tsx to a shared path so every
// centered confirm (admin reset/disable/archive, task ConfirmArchive, …) composes one
// implementation instead of N hand-rolled overlays. Gates destructive/consequential
// actions behind an explicit confirm step; non-destructive actions need no confirm.
//
// States: idle → submitting (onConfirm async) → success (caller closes) / error (inline alert, retry).
// a11y: role=dialog aria-modal, aria-labelledby heading, focus trap (Cancel auto-focuses — never
//   auto-focus the destructive action button), Esc → onCancel, focus returns to the invoker on close.
// Chrome: the shared --scrim dim + --z-modal tier (so a confirm always outranks any drawer it
//   can be launched from — the confirm-behind-drawer bug, cohesion-debt item #3).

import { useState, useId } from 'react'
import { ErrorState } from '@/components/ui/state-kit'
import { ModalShell } from '@/components/ui/modal-shell'

export interface ConfirmDialogProps {
  open: boolean
  /** Dialog heading — e.g. "Reset password for Budi Santoso?" */
  title: string
  /** Consequence body — plain language about what happens. */
  body: string
  /** Action button label — e.g. "Reset password", "Disable", "Archive" */
  confirmLabel: string
  /** Cancel button label (localizable). Default "Cancel". */
  cancelLabel?: string
  /** Busy/working label shown on the confirm button while onConfirm is pending. Default "Working…". */
  busyLabel?: string
  /**
   * Button tone for the confirm button.
   * 'primary' = reversible action (reset, disable — following design-plan §4.7 amber convention).
   * 'destructive' = closest to irreversible (Archive).
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
  cancelLabel = 'Cancel',
  busyLabel = 'Working…',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()

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
    <ModalShell
      open={open}
      onClose={onCancel}
      ariaLabelledBy={titleId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <div
        className="p-6"
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
          {/* Native button with CSS class so we can attach a ref for auto-focus */}
          <button
            type="button"
            className="btn btn-outline"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'destructive' ? 'btn-destructive' : 'btn-primary'}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
