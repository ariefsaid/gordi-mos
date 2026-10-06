import { useT } from '@/i18n/use-t'
import { Button } from './button'
import './list-paging.css'

/** A continuation control for existing lists; the caller owns its server window. */
export function ListPaging({ count, hasMore, loading = false, error = false, moreLabel, onLoadMore }: {
  count: number
  hasMore: boolean
  moreLabel?: string
  loading?: boolean
  error?: boolean
  onLoadMore: () => void
}) {
  const t = useT()
  return (
    <div className="list-paging">
      <p aria-live="polite" aria-atomic="true">{t(hasMore ? 'common.paging.loaded' : 'common.paging.complete', { count })}</p>
      {error ? <p role="alert">{t('common.paging.error')}</p> : null}
      {hasMore ? (
        <Button onClick={onLoadMore} disabled={loading}>
          {loading ? t('common.loading') : error ? t('common.retry') : moreLabel ?? t('common.paging.more')}
        </Button>
      ) : null}
    </div>
  )
}
