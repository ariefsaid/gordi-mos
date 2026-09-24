import { useT } from '@/i18n/use-t'
import type { RowCommitStatus } from './use-row-commits'

/** The status printed beside a row. `item` names the row for the Retry button's accessible name. */
export function RowStatus({ status, item, error, onRetry }: {
  status: RowCommitStatus | undefined
  item: string
  error?: string
  onRetry: () => void
}) {
  const t = useT()
  if (!status) return null
  if (status === 'failed') {
    return (
      <span className="admin-row-status admin-row-status--failed" title={error}>
        <span role="alert">{t('admin.row.failed')}</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          className="admin-row-status__retry"
          aria-label={t('admin.row.retryAria', { item })}
          onClick={(event) => {
            event.stopPropagation()
            onRetry()
          }}
        >
          {t('admin.row.retry')}
        </button>
      </span>
    )
  }
  return (
    <span role="status" className={`admin-row-status admin-row-status--${status}`}>
      {status === 'saving' ? t('admin.row.saving') : t('admin.row.saved')}
    </span>
  )
}
