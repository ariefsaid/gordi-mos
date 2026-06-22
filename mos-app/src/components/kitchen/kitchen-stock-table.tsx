// KitchenStockTable — the desktop read-only stock table (OD-K-5 redesign §6.2 KS-1).
// Columns: Dish · Stok · Tersedia (both right-aligned tabular). Negatives → .kt-neg
// (AA-darkened tint), value NEVER clamped (FR-061/AC-032). Owns a search-mini via
// <KitchenToolbar>. Imports the shared kitchen-table.css grammar (.kt-*); own .kst-*.
// Read-only — NO affordance.
//
// PARITY NOTE (flagged): §6.5 asks for category grouping + a category filter, but
// KitchenStockRow carries NO category (fetchKitchenStock drops it) and invariant #1
// forbids touching the data layer. So this is a flat list + search-only toolbar.
// Exposing the already-fetched category is an owner/Director call (not made here).

import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'
import { KitchenToolbar } from './kitchen-toolbar'
import './kitchen-stock-table.css'

interface KitchenStockTableProps {
  rows: KitchenStockRow[]
  /** the as-of date (WIB today) — used in the table aria-label */
  asOf: string
  search: string
  onSearchChange: (s: string) => void
}

export function KitchenStockTable({ rows, asOf, search, onSearchChange }: KitchenStockTableProps) {
  const q = search.trim().toLowerCase()
  const visible = rows.filter(r => !q || r.wip_item_name.toLowerCase().includes(q))

  return (
    <div className="kst">
      <KitchenToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Find a dish"
        ariaLabel="Stock filters"
      />

      {visible.length === 0 ? (
        <div className="kt-empty" role="status">No items match your filter.</div>
      ) : (
        <table
          className="kt-table kst-table"
          aria-label={`Kitchen stock — on-hand and available per dish for ${asOf}`}
        >
          <thead>
            <tr>
              <th scope="col">Dish</th>
              <th scope="col" className="kt-th-num">Stok</th>
              <th scope="col" className="kt-th-num">Tersedia</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.wip_item_id} className="kst-row">
                <td className="kst-dish">
                  <span className="kt-name">{row.wip_item_name}</span>
                  {row.category && <span className="kt-cat">{row.category}</span>}
                </td>
                <StockCell value={row.stok} />
                <StockCell value={row.tersedia} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// One numeric cell — tabular digits; negative balances preserved + tinted destructive
// (AA-safe --status-lost-text), never clamped (FR-061/AC-032). The minus sign is the
// non-color cue (WCAG 1.4.1); the .kt-neg tint is decorative.
function StockCell({ value }: { value: number }) {
  const negative = value < 0
  return (
    <td className={`kt-num kst-num tabular${negative ? ' kt-neg' : ''}`}>{value}</td>
  )
}
