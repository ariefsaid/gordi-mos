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
import { SearchField } from '@/components/ui/search-field'
import { FilterChip } from '@/components/ui/filter-chip'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
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
  /** A fuller accessible name when the visible placeholder needs a shorter measure. */
  searchAriaLabel?: string
  /** optional LEADING scope slot (ActionTypeSeg on the Log + Plan capture surfaces) */
  children?: ReactNode
  /** Optional action kept beside the search and filters. */
  trailing?: ReactNode
  /** default "Filter" */
  ariaLabel?: string
  /** Phone only: fold the filter controls into one disclosure whose summary names the active choices. */
  filtersPanel?: { label: string; summary: string }
  /** Result count shown at the right end of the toolbar: `shown` rows of `total` (omit `shown` when unfiltered). */
  resultCount?: { shown: number; total: number }
  /** The sort the list follows, said next to the result count. */
  sortLabel?: string
  /** Replaces the "N items" text of the result count (a list of rows or entries, not items). */
  countLabel?: string
  /** Phone only: a sort control; placement defaults to its own row, or may join the folded Filters panel. */
  sortControl?: ReactNode
  sortControlIn?: 'toolbar' | 'panel'
  /** Page-specific active filters shown as removable chips beside the built-in ones. */
  extraChips?: readonly { key: string; label: string; clear: () => void }[]
  /** Display text for a non-default kind (chip label); defaults to the raw value. */
  kindLabel?: (kind: KitchenItemKindFilter) => string
  /** Replaces "Clear all" on the chip row (a page whose chips are all filters says "Clear filters"). */
  clearAllLabel?: string
  /** Clears every chip in one step; use when the chips' own clear handlers cannot be called back to back (URL state). */
  onClearAll?: () => void
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
  searchAriaLabel,
  children,
  trailing,
  ariaLabel = 'Filter',
  filtersPanel,
  resultCount,
  sortLabel,
  countLabel,
  sortControl,
  sortControlIn = 'toolbar',
  extraChips,
  kindLabel,
  clearAllLabel,
  onClearAll,
}: KitchenToolbarProps) {
  const t = useT()
  const desktop = useIsDesktop()
  const folded = Boolean(filtersPanel) && !desktop
  const sortInPanel = folded && sortControlIn === 'panel'
  const placeholder = searchPlaceholder ?? t('kitchen.log.searchPlaceholder')
  const searchName = searchAriaLabel ?? t('cafe.toolbar.searchLabel')
  const compactSetupFilters = !folded && Boolean(
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
  const selectsBlock = (
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
                    : value === 'Unclassified'
                      ? t('kitchen.filter.kind.notSet')
                      : value === 'RAW'
                        ? t('cafe.items.kindRaw')
                        : value === 'WIP' ? t('cafe.items.kindWip') : value}
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
  )
  const optionLabel = {
    kind: (value: KitchenItemKindFilter) => kindLabel?.(value) ?? (value === 'Unclassified' ? t('kitchen.filter.kind.notSet') : value === 'RAW' ? t('cafe.items.kindRaw') : value === 'WIP' ? t('cafe.items.kindWip') : value),
    active: (value: KitchenItemActiveFilter) => value === 'Active' ? t('kitchen.filter.active.active') : t('kitchen.filter.active.inactive'),
  }
  // Folded filters expose hidden choices as removable chips; expanded selects already state their values.
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (kinds && onKindChange && kind && kind !== 'All') chips.push({ key: 'kind', label: optionLabel.kind(kind), clear: () => onKindChange('All') })
  if (activeStates && onActiveChange && active && active !== 'All') chips.push({ key: 'active', label: optionLabel.active(active), clear: () => onActiveChange('All') })
  if (needsUnitStates && onNeedsUnitChange && needsUnit && needsUnit !== 'All') chips.push({ key: 'needsUnit', label: t('kitchen.filter.needsUnit.needs'), clear: () => onNeedsUnitChange('All') })
  if (categories && onCategoryChange && category && category !== 'All') chips.push({ key: 'category', label: categoryLabel?.(category) ?? category, clear: () => onCategoryChange('All') })
  const visibleChips = folded ? [...chips, ...(extraChips ?? [])] : (extraChips ?? [])
  const allChips = [...chips, ...(extraChips ?? [])]
  const clearFilters = () => onClearAll ? onClearAll() : allChips.forEach(chip => chip.clear())
  const showClear = folded ? allChips.length > 1 : chips.length > 0 || allChips.length > 1
  const countText = countLabel ?? (resultCount
    ? resultCount.shown === resultCount.total
      ? t(resultCount.total === 1 ? 'cafe.toolbar.count.one' : 'cafe.toolbar.count.other', { count: resultCount.total })
      : t('cafe.toolbar.countOf', { shown: resultCount.shown, total: resultCount.total })
    : null)
  const countNode = countText
    ? <span className="ktb-count tabular" role="status" aria-live="polite">{countText}{sortLabel && <span className="ktb-count__sort"> · {sortLabel}</span>}</span>
    : null
  // Phone, no leading scope band: the count shares the search label's line (PA4: one row less above the first entry).
  const countOnLabel = !desktop && !children && countNode !== null
  return (
    <div className="ktb" role="group" aria-label={ariaLabel}>
      {children && (
        <div className={filtersBand ? 'ktb-children ktb-children--band' : 'ktb-children'}>
          {children}
        </div>
      )}
      <div className={`ktb-filters${compactSetupFilters ? ' ktb-filters--setup' : ''}`}>
        <div role="search" className="ktb-search-wrap">
          <SearchField label={searchName} placeholder={placeholder} value={search} onChange={onSearchChange} labelEnd={countOnLabel ? countNode : undefined} />
        </div>
        {!folded && selectsBlock}
        {!folded && trailing}
        {folded && filtersPanel && <details className="ktb-panel">
          <summary><span>{filtersPanel.label}</span><span className="ktb-panel__summary">{filtersPanel.summary}</span></summary>
          <div className="ktb-panel__body">{selectsBlock}{trailing}{sortInPanel ? sortControl : null}</div>
        </details>}
      </div>
      {sortControl && !desktop && !sortInPanel && <div className="ktb-sort">{sortControl}</div>}
      {!countOnLabel && countNode}
      {(visibleChips.length > 0 || showClear) && (
        <div className="ktb-chips" role="group" aria-label={t('cafe.toolbar.activeFilters')}>
          {visibleChips.map(chip => <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />)}
          {showClear && <button type="button" className="ktb-chips__clear" onClick={clearFilters}>{clearAllLabel ?? t('cafe.toolbar.clearAll')}</button>}
        </div>
      )}
    </div>
  )
}
