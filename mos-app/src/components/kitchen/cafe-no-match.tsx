import { useT } from '@/i18n/use-t'

/** The filter matched no item: say so and offer the one way out (clear the search and filters).
 *  `bare` is for a host that already is the status region (a table's empty row). */
export function CafeNoMatch({ onClear, bare = false }: { onClear?: () => void; bare?: boolean }) {
  const t = useT()
  const body = (
    <>
      <span>{t('kitchen.filter.noMatch')}</span>
      {onClear ? <button type="button" className="btn btn-outline" onClick={onClear}>{t('common.clearFilters')}</button> : null}
    </>
  )
  return bare ? body : <div className="cafe-no-match" role="status">{body}</div>
}
