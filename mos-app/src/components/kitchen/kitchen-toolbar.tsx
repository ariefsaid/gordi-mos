// KitchenToolbar — the shared scope + search-mini + category filter (OD-K-5 redesign §2.3).
// Lifted from Log's .klt-toolbar so Plan + Stock (optionally Review) share it. Flat
// utility surface (no --shadow-rest): --card bg, --border bottom, 10–12px pad.
// Optional LEADING scope slot (ActionTypeSeg) + search-mini (role="search") + optional
// category dropdown. Token-only (DESIGN.md).
//
// v4 (chrome merge): the slot is LEADING, not trailing. Café · Log and Café · Plan both
// stacked ActionTypeSeg in a band of its own directly above this one — two bordered utility
// strips saying "here is the chrome", costing a whole extra row of phone screen on the
// surfaces whose entire job is reaching the list. They now share ONE band. The slot leads
// because the scope control decides what every row in the list *means* (which action_type's
// plan/made), so it outranks the filters — and leading it in the DOM keeps focus and
// reading order agreeing with the visual order instead of buying that with `order: -1`.

import type { ReactNode } from 'react'
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n/use-t'
import './kitchen-toolbar.css'

interface KitchenToolbarProps {
  search: string
  onSearchChange: (s: string) => void
  /** categories derived by the caller (['All', …unique sorted]); omit → no select. The
   *  sentinel value 'All' stays an untranslated internal value (comparisons key off it);
   *  only its DISPLAYED option text is localized, below. */
  categories?: string[]
  category?: string
  onCategoryChange?: (c: string) => void
  /** default: the shared "Find a dish" catalog string */
  searchPlaceholder?: string
  /** optional LEADING scope slot (ActionTypeSeg on the Log + Plan capture surfaces) */
  children?: ReactNode
  /** default "Filter" */
  ariaLabel?: string
}

export function KitchenToolbar({
  search,
  onSearchChange,
  categories,
  category,
  onCategoryChange,
  searchPlaceholder,
  children,
  ariaLabel = 'Filter',
}: KitchenToolbarProps) {
  const t = useT()
  const placeholder = searchPlaceholder ?? t('kitchen.log.searchPlaceholder')
  // #378: when BOTH filters ride this toolbar (search + category), the scope slot is a
  // BAND, not a row-sharer. The derived movement catalog made the slot's content
  // (931–1091px at 1440) wider than any row it could share with the filters, and
  // "share when it happens to fit" is exactly the accidental composition the audit
  // caught squeezing the search to 40.75px. The class carries the decision; the
  // geometry lives in kitchen-toolbar.css. Toolbars WITHOUT the category (Stock)
  // keep the leading-row composition — their scope still fits beside the search.
  const filtersBand = Boolean(categories && onCategoryChange)
  return (
    <div className="ktb" aria-label={ariaLabel}>
      {children && (
        <div className={filtersBand ? 'ktb-children ktb-children--band' : 'ktb-children'}>
          {children}
        </div>
      )}
      <div role="search" className="ktb-search-wrap">
        <input
          type="search"
          className="ktb-search"
          placeholder={placeholder}
          aria-label={placeholder}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      {categories && onCategoryChange && (
        <Select
          className="ktb-category"
          aria-label={t('kitchen.toolbar.category.ariaLabel')}
          value={category}
          onChange={e => onCategoryChange(e.target.value)}
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === 'All' ? t('kitchen.filter.all') : c}</option>
          ))}
        </Select>
      )}
    </div>
  )
}
