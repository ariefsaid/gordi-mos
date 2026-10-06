import { useT } from '@/i18n/use-t'
import { Button } from './button'
import './list-paging.css'

/** A continuation control for existing lists; the caller owns its server window. */
export function ListPaging({ count, hasMore, loading = false, error = false, moreLabel, emptyItems, onLoadMore }: {
  count: number
  hasMore: boolean
  moreLabel?: string
  emptyItems?: string
  loading?: boolean
  error?: boolean
  onLoadMore: () => void
}) {
  const t = useT()
  const emptyAndCanContinue = count === 0 && hasMore
  return (
    <div className="list-paging" aria-busy={loading}>
      <p className={emptyAndCanContinue ? 'sr-only' : undefined} aria-live="polite" aria-atomic="true">
        {emptyAndCanContinue
          ? emptyItems
            ? t('common.paging.emptyFiltered', { items: emptyItems })
            : t('common.paging.emptyLoaded')
          : t(hasMore ? 'common.paging.loaded' : 'common.paging.complete', { count })}
      </p>
      {emptyAndCanContinue ? <p>{t('common.paging.continue')}</p> : null}
      <p
        className={`list-paging__error${error ? '' : ' list-paging__error--hidden'}`}
        role={error ? 'alert' : undefined}
        aria-hidden={!error}
      >
        {error ? t('common.paging.error') : '\u00a0'}
      </p>
      {hasMore ? (
        <Button
          aria-disabled={loading}
          aria-busy={loading}
          onClick={() => { if (!loading) onLoadMore() }}
        >
          {loading ? t('common.loading') : error ? t('common.retry') : moreLabel ?? t('common.paging.more')}
        </Button>
      ) : null}
    </div>
  )
}
