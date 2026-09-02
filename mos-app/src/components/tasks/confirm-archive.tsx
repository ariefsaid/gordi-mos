import { useT } from '@/i18n/use-t'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

// ── Confirm-archive dialog ───────────────────────────────────────────────────
// Thin preset over the shared ConfirmDialog primitive (cohesion-debt 2026-07-19,
// item #4). Formerly a bespoke hand-rolled centered overlay; now composes the one
// centered-modal primitive (gaining Esc-to-cancel + focus-trap it lacked).
// Kept conditionally mounted by callers, so `open` is always true here — the OTHER
// supported style (open toggles, caller stays mounted) is task-drawer.tsx's two sites;
// the primitive resets its own busy state on open->false so both styles are safe (#624).
export type ConfirmArchiveProps = {
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmArchive({ onConfirm, onCancel }: ConfirmArchiveProps) {
  const t = useT()
  return (
    <ConfirmDialog
      open
      title={t('tasks.archiveConfirmation')}
      body={t('tasks.archiveConfirmationCopy')}
      confirmLabel={t('tasks.archiveConfirm')}
      cancelLabel={t('tasks.cancel')}
      tone="destructive"
      onConfirm={async () => { onConfirm() }}
      onCancel={onCancel}
    />
  )
}
