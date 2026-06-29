// KitchenPlanCards — the phone reflow for the plan editor (OD-K-5 redesign §4.2 PE-2).
// One card per dish (name + category + PlanQtyStepper), grouped by category via
// <KitchenGroupHeader variant=cards>. Owns client search + category filter via
// <KitchenToolbar>. NO off-plan expander (Plan has no planned/off-plan split — every
// item is plannable). Empty-filter message. Token-only (DESIGN.md); .kpc-* namespace.

import type { WipItemOption } from '@/lib/db/kitchen-logs.types'
import { groupByCategory } from '@/lib/kitchen-category'
import { PlanQtyStepper } from './plan-qty-stepper'
import { KitchenGroupHeader } from './kitchen-group-header'
import { KitchenToolbar } from './kitchen-toolbar'
import './kitchen-plan-cards.css'

interface KitchenPlanCardsProps {
  items: WipItemOption[]
  /** planned qty for (wip_item_id, current action) */
  qtyOf: (wipItemId: string) => number
  /** wip_item_id currently mid-save */
  savingId: string | null
  /** offline */
  disabled: boolean
  /** commit a cell → upsertKitchenPlan at the page */
  onSave: (wipItemId: string, next: number) => void
  search: string
  onSearchChange: (s: string) => void
  category: string
  onCategoryChange: (c: string) => void
}

export function KitchenPlanCards({
  items, qtyOf, savingId, disabled, onSave,
  search, onSearchChange, category, onCategoryChange,
}: KitchenPlanCardsProps) {
  const q = search.trim().toLowerCase()
  const matchSearch = (it: WipItemOption) => !q || it.name.toLowerCase().includes(q)
  const matchCat = (it: WipItemOption) => category === 'All' || (it.category ?? '') === category
  const visible = items.filter(it => matchSearch(it) && matchCat(it))

  const categories = ['All', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean))).sort()]
  // Null-safe grouping: uncategorised items fall into a fallback bucket so they
  // are never silently dropped (staging/prod data has no categories — Teable omits
  // the field).
  const groupCats = groupByCategory(visible)

  return (
    <div className="kpc">
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
        groupCats.map(group => {
          // null cat = uncategorised fallback bucket — render without a group header
          // so flat ungrouped lists appear when no categories exist (staging/prod).
          const groupKey = group.cat ?? '__uncategorised__'
          return (
            <section key={groupKey} className="kpc-section">
              {group.cat !== null && (
                <KitchenGroupHeader
                  variant="cards"
                  label={group.cat}
                  count={group.rows.length}
                  collapsed={false}
                  onToggle={() => {}}
                />
              )}
              <div className="kpc-cards">
                {group.rows.map(item => (
                  <div key={item.id} className="kpc-card">
                    <div className="kpc-head">
                      <span className="kpc-name">{item.name}</span>
                      {item.category && <span className="kpc-cat">{item.category}</span>}
                    </div>
                    <PlanQtyStepper
                      itemName={item.name}
                      qty={qtyOf(item.id)}
                      saving={savingId === item.id}
                      disabled={disabled}
                      onSave={next => onSave(item.id, next)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
