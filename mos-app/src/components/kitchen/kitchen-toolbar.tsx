// KitchenToolbar — the shared search-mini + category filter (OD-K-5 redesign §2.3).
// Lifted from Log's .klt-toolbar so Plan + Stock (optionally Review) share it. Flat
// utility surface (no --shadow-rest): --card bg, --border bottom, 10–12px pad.
// search-mini (role="search") + optional category <select> + optional children slot
// (e.g. ActionTypeSeg on the Plan editor). Token-only (DESIGN.md).

import type { ReactNode } from 'react'
import './kitchen-toolbar.css'

interface KitchenToolbarProps {
  search: string
  onSearchChange: (s: string) => void
  /** categories derived by the caller (['All', …unique sorted]); omit → no select */
  categories?: string[]
  category?: string
  onCategoryChange?: (c: string) => void
  /** default "Find a dish" */
  searchPlaceholder?: string
  /** optional trailing slot (e.g. ActionTypeSeg on the Plan editor) */
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
  searchPlaceholder = 'Find a dish',
  children,
  ariaLabel = 'Filter',
}: KitchenToolbarProps) {
  return (
    <div className="ktb" aria-label={ariaLabel}>
      <div role="search" className="ktb-search-wrap">
        <input
          type="search"
          className="ktb-search"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      {categories && onCategoryChange && (
        <select
          className="ktb-category"
          aria-label="Category"
          value={category}
          onChange={e => onCategoryChange(e.target.value)}
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {children && <div className="ktb-children">{children}</div>}
    </div>
  )
}
