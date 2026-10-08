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
import type {
  KitchenItemActiveFilter,
  KitchenItemKindFilter,
  KitchenItemNeedsUnitFilter,
} from '@/lib/kitchen-item-list'
import './kitchen-toolbar.css'

interface KitchenToolbarProps {
  search: string
  onSearchChange: (s: string) => void
  /** Item kinds derived by the caller; omit → no kind select. */
  kinds?: readonly KitchenItemKindFilter[]
  kind?: KitchenItemKindFilter
  onKindChange?: (kind: KitchenItemKindFilter) => void
  /** Active-state choices derived by the caller; omit → no active filter. */
  activeStates?: readonly KitchenItemActiveFilter[]
  active?: KitchenItemActiveFilter
  onActiveChange?: (active: KitchenItemActiveFilter) => void
  activeId?: string
  /** Unit-setup choices derived by the caller; omit → no setup filter. */
  needsUnitStates?: readonly KitchenItemNeedsUnitFilter[]
  needsUnit?: KitchenItemNeedsUnitFilter
  onNeedsUnitChange?: (needsUnit: KitchenItemNeedsUnitFilter) => void
  needsUnitId?: string
  /** Optional stable id for the visible kind trigger when a surface is audited. */
  kindId?: string
  /** categories derived by the caller (['All', …unique sorted]); omit → no select. The
   *  sentinel value 'All' stays an untranslated internal value (comparisons key off it);
   *  only its DISPLAYED option text is localized, below. */
  categories?: string[]
  category?: string
  onCategoryChange?: (c: string) => void
  /** Optional display formatter; option values remain stable source category IDs. */
  categoryLabel?: (category: string) => string
  /** Optional stable id for the visible category trigger when a surface is audited. */
  categoryId?: string
  /** default: the shared "Find a dish" catalog string */
  searchPlaceholder?: string
  /** optional LEADING scope slot (ActionTypeSeg on the Log + Plan capture surfaces) */
  children?: ReactNode
  /** Optional action kept beside the search and filters. */
  trailing?: ReactNode
  /** default "Filter" */
  ariaLabel?: string
}

export function KitchenToolbar({
  search,
  onSearchChange,
  kinds,
  kind,
  onKindChange,
  kindId,
  activeStates,
  active,
  onActiveChange,
  activeId,
  needsUnitStates,
  needsUnit,
  onNeedsUnitChange,
  needsUnitId,
  categories,
  category,
  onCategoryChange,
  categoryLabel,
  categoryId,
  searchPlaceholder,
  children,
  trailing,
  ariaLabel = 'Filter',
}: KitchenToolbarProps) {
  const t = useT()
  const placeholder = searchPlaceholder ?? t('kitchen.log.searchPlaceholder')
  const compactSetupFilters = Boolean(
    activeStates && onActiveChange && needsUnitStates && onNeedsUnitChange,
  )
  // #378: when BOTH filters ride this toolbar (search + category), the scope slot is a
  // BAND, not a row-sharer. The derived movement catalog made the slot's content
  // (931–1091px at 1440) wider than any row it could share with the filters, and
  // "share when it happens to fit" is exactly the accidental composition the audit
  // caught squeezing the search to 40.75px. The class carries the decision; the
  // geometry lives in kitchen-toolbar.css. Toolbars WITHOUT the category (Stock)
  // keep the leading-row composition — their scope still fits beside the search.
  const filtersBand = Boolean(
    (categories && onCategoryChange)
    || (kinds && onKindChange)
    || (activeStates && onActiveChange)
    || (needsUnitStates && onNeedsUnitChange),
  )
  return (
    <div className="ktb" aria-label={ariaLabel}>
      {children && (
        <div className={filtersBand ? 'ktb-children ktb-children--band' : 'ktb-children'}>
          {children}
        </div>
      )}
      <div className={`ktb-filters${compactSetupFilters ? ' ktb-filters--setup' : ''}`}>
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
        <div className="ktb-filter-selects">
          {kinds && onKindChange && (
            <Select
              id={kindId}
              className="ktb-kind"
              aria-label={t('kitchen.toolbar.kind.ariaLabel')}
              value={kind}
              onChange={e => onKindChange(e.target.value as KitchenItemKindFilter)}
            >
              {kinds.map(value => (
                <option key={value} value={value}>
                  {value === 'All'
                    ? t('kitchen.filter.kind.all')
                    : value === 'Unclassified' ? t('kitchen.filter.kind.notSet') : value}
                </option>
              ))}
            </Select>
          )}
          {activeStates && onActiveChange && (
            <Select
              id={activeId}
              className="ktb-active"
              aria-label={t('kitchen.toolbar.active.ariaLabel')}
              value={active}
              onChange={e => onActiveChange(e.target.value as KitchenItemActiveFilter)}
            >
              {activeStates.map(value => (
                <option key={value} value={value}>
                  {value === 'All'
                    ? t('kitchen.filter.active.all')
                    : value === 'Active' ? t('kitchen.filter.active.active') : t('kitchen.filter.active.inactive')}
                </option>
              ))}
            </Select>
          )}
          {needsUnitStates && onNeedsUnitChange && (
            <Select
              id={needsUnitId}
              className="ktb-needs-unit"
              aria-label={t('kitchen.toolbar.needsUnit.ariaLabel')}
              value={needsUnit}
              onChange={e => onNeedsUnitChange(e.target.value as KitchenItemNeedsUnitFilter)}
            >
              {needsUnitStates.map(value => (
                <option key={value} value={value}>
                  {value === 'All' ? t('kitchen.filter.needsUnit.all') : t('kitchen.filter.needsUnit.needs')}
                </option>
              ))}
            </Select>
          )}
          {categories && onCategoryChange && (
            <Select
              id={categoryId}
              className="ktb-category"
              aria-label={t('kitchen.toolbar.category.ariaLabel')}
              value={category}
              onChange={e => onCategoryChange(e.target.value)}
            >
              {categories.map(c => (
                <option key={c} value={c}>{c === 'All' ? t('kitchen.filter.all') : categoryLabel?.(c) ?? c}</option>
              ))}
            </Select>
          )}
        </div>
        {trailing}
      </div>
    </div>
  )
}
