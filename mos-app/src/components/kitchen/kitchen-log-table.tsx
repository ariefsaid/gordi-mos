// KitchenLogTable — the desktop <table> (plan §4.1 N7, §8.1).
// Sticky <thead> (5 cols), Planned/Off-plan <KitchenGroupHeader>s, <KitchenLogRow>
// per visible dish. Owns client-side search + category filter (props in → filtered rows).
// Group collapse hides rows. Loading/empty handled by the page; this component renders
// the populated table (or an empty-filter message). Token-only (DESIGN.md).

import type { WipItemOption, KitchenLogLine, KitchenActionType } from '@/lib/db/kitchen-logs.types'
import { KitchenLogRow } from './kitchen-log-row'
import { KitchenGroupHeader } from './kitchen-group-header'
import './kitchen-log-table.css'

interface KitchenLogTableProps {
  items: WipItemOption[]
  lines: Record<string, KitchenLogLine>
  actionType: KitchenActionType
  search: string
  category: string
  collapsedGroups: Set<string>
  onQtyChange: (itemId: string, qty: number) => void
  onNotesChange: (itemId: string, note: string) => void
  onToggleGroup: (key: string) => void
  onSearchChange: (s: string) => void
  onCategoryChange: (c: string) => void
  disabled?: boolean
}

const PLANNED_KEY = 'planned'
const OFFPLAN_KEY = 'offplan'

export function KitchenLogTable({
  items, lines, actionType, search, category, collapsedGroups,
  onQtyChange, onNotesChange, onToggleGroup, onSearchChange, onCategoryChange, disabled,
}: KitchenLogTableProps) {
  const q = search.trim().toLowerCase()
  const matchSearch = (it: WipItemOption) => !q || it.name.toLowerCase().includes(q)
  const matchCat = (it: WipItemOption) => category === 'All' || (it.category ?? '') === category

  const planned = items.filter(it => (lines[it.id]?.plan_qty ?? 0) > 0 && matchSearch(it) && matchCat(it))
  const offPlan = items.filter(it => (lines[it.id]?.plan_qty ?? 0) <= 0 && matchSearch(it) && matchCat(it))
  const totalVisible = planned.length + offPlan.length

  // Category options derived from items (unique, sorted) + "All"
  const categories = ['All', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean))).sort()]

  const plannedCollapsed = collapsedGroups.has(PLANNED_KEY)
  const offplanCollapsed = collapsedGroups.has(OFFPLAN_KEY)

  return (
    <div className="klt">
      <div className="klt-toolbar">
        <input
          type="search"
          className="klt-search"
          placeholder="Find a dish"
          aria-label="Find a dish"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
        <select
          className="klt-category"
          aria-label="Category"
          value={category}
          onChange={e => onCategoryChange(e.target.value)}
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {totalVisible === 0 ? (
        <div className="klt-empty" role="status">No dishes match your filter.</div>
      ) : (
        <table className="klt-table" aria-label="Kitchen production log — enter made-today quantity per dish">
          <thead>
            <tr>
              <th scope="col" className="klt-th klt-th-dish">Dish</th>
              <th scope="col" className="klt-th klt-th-num">Plan</th>
              <th scope="col" className="klt-th klt-th-num">Stock</th>
              <th scope="col" className="klt-th klt-th-num klt-th-made">Made today</th>
              <th scope="col" className="klt-th klt-th-num">Status</th>
            </tr>
          </thead>
          <tbody>
            <KitchenGroupHeader
              variant="table"
              label="Planned today"
              count={planned.length}
              collapsed={plannedCollapsed}
              onToggle={() => onToggleGroup(PLANNED_KEY)}
              colSpan={5}
            />
            {!plannedCollapsed && planned.map(item => (
              <KitchenLogRow
                key={item.id}
                item={item}
                line={lines[item.id]}
                actionType={actionType}
                onQtyChange={qty => onQtyChange(item.id, qty)}
                onNotesChange={note => onNotesChange(item.id, note)}
                disabled={disabled}
              />
            ))}
            <KitchenGroupHeader
              variant="table"
              label="Off-plan"
              count={offPlan.length}
              sub="log as produced"
              collapsed={offplanCollapsed}
              onToggle={() => onToggleGroup(OFFPLAN_KEY)}
              colSpan={5}
            />
            {!offplanCollapsed && offPlan.map(item => (
              <KitchenLogRow
                key={item.id}
                item={item}
                line={lines[item.id]}
                actionType={actionType}
                onQtyChange={qty => onQtyChange(item.id, qty)}
                onNotesChange={note => onNotesChange(item.id, note)}
                disabled={disabled}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
