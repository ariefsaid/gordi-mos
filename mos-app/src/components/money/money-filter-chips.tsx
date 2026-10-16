// The active Money filters as removable chips under the toolbar (the shared FilterChip); each one
// names the filter and its value, and its ✕ clears just that filter. Shown only while a filter is on.
import { useT } from '@/i18n/use-t'
import { FilterChip } from '@/components/ui/filter-chip'
import './money-filter-chips.css'

export interface MoneyChip { id: string; label: string; onRemove: () => void }

export function MoneyFilterChips({ chips }: { chips: MoneyChip[] }) {
  const t = useT()
  if (chips.length === 0) return null
  return (
    <ul className="money-chips" aria-label={t('money.filter.scope')}>
      {chips.map((chip) => <li key={chip.id}><FilterChip label={chip.label} onRemove={chip.onRemove} /></li>)}
    </ul>
  )
}
