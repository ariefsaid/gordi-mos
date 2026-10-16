// Previous / Next with the shown-and-loaded count. The page number lives in the URL; there is no
// infinite scroll, and the totals above are the whole period, never this page.
import { Button } from '@/components/ui/button'
import type { MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'

export function RecordsPager({ t, page, pages, start, shown, total, onPage, label, showingKey = 'records.pager.showing' }: {
  t: Translate
  /** The nav's accessible name when this is not a list of records. */
  label?: string
  /** The "Showing a to b of n" sentence, when its noun is not records. */
  showingKey?: MessageKey
  page: number
  pages: number
  start: number
  shown: number
  total: number
  onPage: (page: number) => void
}) {
  if (total === 0) return null
  return (
    <nav className="rec-pager" aria-label={label ?? t('records.pager.label')}>
      <p className="rec-pager__status tabular" role="status" aria-live="polite">
        {t(showingKey, { from: start + 1, to: start + shown, total })} · {t('records.pager.page', { page, pages })}
      </p>
      {pages > 1 && (
        <div className="rec-pager__buttons">
          <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('records.pager.previous')}</Button>
          <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('records.pager.next')}</Button>
        </div>
      )}
    </nav>
  )
}
