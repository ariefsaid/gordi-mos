import { useT } from '@/i18n/use-t'
import { Button } from './button'
import './list-paging.css'

/** A continuation control for existing lists; the caller owns its server window. */
export function ListPaging({ count, hasMore, loading = false, error = false, onLoadMore }: {
  count: number
  hasMore: boolean
  loading?: boolean
  error?: boolean
  onLoadMore: () => void
}) {
  const t = useT()
  return (
    <div className="list-paging">
      <p role="status">{t(hasMore ? 'common.paging.loaded' : 'common.paging.complete', { count })}</p>
      {error ? <p role="alert">{t('common.paging.error')}</p> : null}
      {hasMore ? (
        <Button onClick={onLoadMore} disabled={loading}>
          {t(loading ? 'common.loading' : error ? 'common.retry' : 'common.paging.more')}
        </Button>
      ) : null}
    </div>
  )
}
