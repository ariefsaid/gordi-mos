// KitchenStockCards — the phone reflow for stock (OD-K-5 redesign §6.2 KS-2).
// One card per dish (name + two big tabular numbers Stok/Tersedia). Negatives tinted
// (.kt-neg), zero muted. Owns a search-mini via <KitchenToolbar>. Read-only (no
// affordance). Token-only (DESIGN.md); .ksc-* namespace.
// (No category grouping — KitchenStockRow carries no category; parity, flagged.)

import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'
import { KitchenToolbar } from './kitchen-toolbar'
import './kitchen-stock-cards.css'

interface KitchenStockCardsProps {
  rows: KitchenStockRow[]
  search: string
  onSearchChange: (s: string) => void
}

export function KitchenStockCards({ rows, search, onSearchChange }: KitchenStockCardsProps) {
  const q = search.trim().toLowerCase()
  const visible = rows.filter(r => !q || r.wip_item_name.toLowerCase().includes(q))

  return (
    <div className="ksc">
      <KitchenToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Find a dish"
        ariaLabel="Stock filters"
      />

      {visible.length === 0 ? (
        <div className="kt-empty" role="status">No items match your filter.</div>
      ) : (
        <div className="ksc-cards">
          {visible.map(row => (
            <div key={row.wip_item_id} className="ksc-card">
              <span className="ksc-name">{row.wip_item_name}</span>
              <div className="ksc-cuts">
                <StockStat label="Stok" value={row.stok} />
                <StockStat label="Tersedia" value={row.tersedia} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// One cut stat — tabular digits; negative balances preserved + tinted (AA-safe
// --status-lost-text via .kt-neg), never clamped (FR-061/AC-032).
function StockStat({ label, value }: { label: string; value: number }) {
  const negative = value < 0
  return (
    <div className="ksc-stat">
      <span className="ksc-stat-label">{label}</span>
      <span className={`ksc-stat-val tabular${negative ? ' kt-neg' : ''}`}>{value}</span>
    </div>
  )
}
