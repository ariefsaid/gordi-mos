// KitchenPesananTable — the desktop read-only pesanan <table> (OD-K-5 redesign §5.2 PN-1).
// One table with date group-headers (KitchenGroupHeader variant=table) + 3 columns
// Item · Action · Planned (right-aligned tabular). Read-only — NO affordance (AC-024).
// The date `groups` (group-by-date) are built at the page and passed in verbatim.
// Imports the shared kitchen-table.css grammar (.kt-*); own additions under .kptn-*.
// Token-only (DESIGN.md).

import { Fragment } from 'react'
import type { PesananRow } from '@/lib/db/kitchen-logs.types'
import { KitchenGroupHeader } from './kitchen-group-header'
import './kitchen-pesanan-table.css'

export interface PesananDateGroup {
  date: string
  items: PesananRow[]
}

interface KitchenPesananTableProps {
  groups: PesananDateGroup[]
}

export function KitchenPesananTable({ groups }: KitchenPesananTableProps) {
  if (groups.length === 0) return null

  return (
    <table className="kt-table kptn-table" aria-label="Planned items — pesanan horizon">
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Action</th>
          <th scope="col" className="kt-th-num">Planned</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(group => (
          <Fragment key={group.date}>
            <KitchenGroupHeader
              variant="table"
              label={group.date}
              count={group.items.length}
              collapsed={false}
              onToggle={() => {}}
              colSpan={3}
            />
            {group.items.map(r => (
              <tr key={`${r.log_date}-${r.wip_item_id}-${r.action_type}`} className="kptn-row">
                <td className="kptn-item">
                  <span className="kt-name">{r.wip_item_name}</span>
                  {r.category && <span className="kt-cat">{r.category}</span>}
                </td>
                <td className="kptn-action">{r.action_type}</td>
                <td className="kt-num kptn-qty tabular">{r.qty_porsi}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}
