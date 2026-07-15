import { useT } from '@/i18n/use-t'

// ── Confirm-archive dialog ───────────────────────────────────────────────────
export type ConfirmArchiveProps = {
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmArchive({ onConfirm, onCancel }: ConfirmArchiveProps) {
  const t = useT()
  return (
    <div role="dialog" aria-modal="true" aria-label={t('tasks.archiveConfirmation')} className="confirm-overlay">
      <div className="confirm-box">
        <p className="confirm-msg">{t('tasks.archiveConfirmationCopy')}</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>{t('tasks.cancel')}</button>
          <button type="button" className="btn btn-destructive" onClick={onConfirm} aria-label={t('tasks.archiveConfirm')}>{t('tasks.archiveConfirm')}</button>
        </div>
      </div>
    </div>
  )
}
