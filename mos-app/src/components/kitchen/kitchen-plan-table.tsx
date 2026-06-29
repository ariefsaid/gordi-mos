// KitchenPlanTable — the desktop editable PLAN <table> (OD-K-5 redesign §4.2/§4.6).
// Columns: Dish (name + category sub-label) · Plan (PlanQtyCell, right-aligned tabular).
// Groups by category (F2 populates categories) via <KitchenGroupHeader variant=table>.
// Owns client search + category filter via <KitchenToolbar>. Empty-filter message.
// Imports the shared kitchen-table.css grammar (.kt-*); own additions under .kpt-*.
// One-Blue: only the focused qty-cell input. Token-only (DESIGN.md).

import { Fragment, useState } from 'react'
import type { WipItemOption } from '@/lib/db/kitchen-logs.types'
import { groupByCategory } from '@/lib/kitchen-category'
import { PlanQtyCell } from './plan-qty-cell'
import { KitchenGroupHeader } from './kitchen-group-header'
import { KitchenToolbar } from './kitchen-toolbar'
import './kitchen-plan-table.css'

interface KitchenPlanTableProps {
  items: WipItemOption[]
  /** planned qty for (wip_item_id, current action) — the page owns the plan cells */
  qtyOf: (wipItemId: string) => number
  /** wip_item_id currently mid-save (per-cell saving state) */
  savingId: string | null
  /** offline — disables every cell */
  disabled: boolean
  /** commit a cell → upsertKitchenPlan at the page */
  onSave: (wipItemId: string, next: number) => void
  search: string
  onSearchChange: (s: string) => void
  category: string
  onCategoryChange: (c: string) => void
}

export function KitchenPlanTable({
  items, qtyOf, savingId, disabled, onSave,
  search, onSearchChange, category, onCategoryChange,
}: KitchenPlanTableProps) {
  // Local group-collapse state (the editor need not persist collapse across reflow).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const q = search.trim().toLowerCase()
  const matchSearch = (it: WipItemOption) => !q || it.name.toLowerCase().includes(q)
  const matchCat = (it: WipItemOption) => category === 'All' || (it.category ?? '') === category

  const visible = items.filter(it => matchSearch(it) && matchCat(it))

  // Category options derived from ALL items (unique, sorted) + "All" — so filtering
  // by one category doesn't remove the others from the select.
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean))).sort()]

  // Group the visible items by category (sorted), with null-category items in a
  // fallback bucket so they are never silently dropped (staging/prod has no categories).
  const groups = groupByCategory(visible)

  return (
    <div className="kpt">
      <KitchenToolbar
        search={search}
        onSearchChange={onSearchChange}
        categories={categories}
        category={category}
        onCategoryChange={onCategoryChange}
        searchPlaceholder="Find a dish to plan"
        ariaLabel="Plan filters"
      />

      {visible.length === 0 ? (
        <div className="kt-empty" role="status">No dishes match your filter.</div>
      ) : (
        <table className="kt-table" aria-label="Kitchen plan — set planned quantity per dish">
          <thead>
            <tr>
              <th scope="col">Dish</th>
              <th scope="col" className="kt-th-num">Plan</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => {
              // null cat = uncategorised fallback bucket — render rows directly,
              // no group header (staging/prod data has no categories).
              const groupKey = group.cat ?? '__uncategorised__'
              const isCollapsed = collapsed.has(groupKey)
              return (
                <Fragment key={groupKey}>
                  {group.cat !== null && (
                    <KitchenGroupHeader
                      variant="table"
                      label={group.cat}
                      count={group.rows.length}
                      collapsed={isCollapsed}
                      onToggle={() => toggleGroup(groupKey)}
                      colSpan={2}
                    />
                  )}
                  {!isCollapsed && group.rows.map(item => (
                    <tr key={item.id} className="kpt-row">
                      <td className="kpt-dish">
                        <span className="kt-name">{item.name}</span>
                        {item.category && <span className="kt-cat">{item.category}</span>}
                      </td>
                      <td className="kt-num kpt-plan">
                        <PlanQtyCell
                          itemName={item.name}
                          qty={qtyOf(item.id)}
                          saving={savingId === item.id}
                          disabled={disabled}
                          onSave={next => onSave(item.id, next)}
                        />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
