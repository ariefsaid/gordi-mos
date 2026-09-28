// Long choice lists in the person panel (Teams, Positions). Past a handful of rows the list opens
// showing only what the person already has, with a filter and a "Show all" — so the panel reads
// in one screen instead of three. Chosen items come first; the order is fixed when the section
// mounts, so a row never jumps away from the pointer that just checked it.

import { useId } from 'react'
import { useT } from '@/i18n/use-t'

export function ListFilter({ section, value, onChange }: { section: string; value: string; onChange: (value: string) => void }) {
  const t = useT()
  const inputId = useId()
  return (
    <div className="admin-list-filter">
      <label htmlFor={inputId} className="sr-only">{t('admin.person.filterLabel', { section })}</label>
      <input
        id={inputId}
        type="search"
        className="admin-list-filter__input"
        placeholder={t('admin.person.filterPlaceholder')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}

export function FilterEmpty({ query }: { query: string }) {
  const t = useT()
  return <p className="admin-list-filter__empty">{t('admin.person.filterEmpty', { q: query.trim() })}</p>
}

export function ShowAll({ count, onShow }: { count: number; onShow: () => void }) {
  const t = useT()
  return (
    <button type="button" className="admin-list-filter__show-all" onClick={onShow}>
      {t('admin.person.showAll', { count })}
    </button>
  )
}
