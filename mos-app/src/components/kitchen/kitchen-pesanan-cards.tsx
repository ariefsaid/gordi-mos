// KitchenPesananCards — the phone reflow for pesanan (OD-K-5 redesign §5.2 PN-2).
// One card per date (KitchenGroupHeader variant=cards + a compact list of item rows:
// name + action · planned qty). Read-only — NO affordance (AC-024). No stepper.
// The date `groups` (group-by-date) are built at the page and passed in verbatim.
// Token-only (DESIGN.md); .kpcn-* namespace.

import type { PesananRow } from '@/lib/db/kitchen-logs.types'
import type { PesananDateGroup } from './kitchen-pesanan-table'
import { KitchenGroupHeader } from './kitchen-group-header'
import './kitchen-pesanan-cards.css'

interface KitchenPesananCardsProps {
  groups: PesananDateGroup[]
}

export function KitchenPesananCards({ groups }: KitchenPesananCardsProps) {
  if (groups.length === 0) return null

  return (
    <div className="kpcn">
      {groups.map(group => (
        <section key={group.date} className="kpcn-section" aria-label={`Plan for ${group.date}`}>
          <KitchenGroupHeader
            variant="cards"
            label={group.date}
            count={group.items.length}
            collapsed={false}
            onToggle={() => {}}
          />
          <div className="kpcn-card">
            {group.items.map((r: PesananRow) => (
              <div key={`${r.log_date}-${r.wip_item_id}-${r.action_type}`} className="kpcn-row">
                <div className="kpcn-itemwrap">
                  <span className="kpcn-item">{r.wip_item_name}</span>
                  <span className="kpcn-action">{r.action_type}</span>
                </div>
                <span className="kpcn-qty tabular">{r.qty_porsi}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
