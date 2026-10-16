// Presentation components shared by the Records readings and panels: status badges and the quantity cell.
import type { ReactNode } from 'react'
import { StatusBadge } from '@/components/ui/status-badge'
import type { Translate } from '@/i18n/use-t'
import type { Dec } from '@/lib/cafe-records/decimal'
import type { Movement, RecordEntry, StatusBasis, UnitBasis } from '@/lib/cafe-records/model'
import { STATUS_KEY, postingBadge, quantityText, statusLabel, unitText } from './records-labels'

function StatusPill({ t, movement, status }: { t: Translate; movement: Movement; status: StatusBasis }) {
  return <StatusBadge status={STATUS_KEY[status]} label={statusLabel(t, movement, status)} />
}

export function EntryStatus({ t, entry }: { t: Translate; entry: RecordEntry }) {
  const posting = postingBadge(t, entry)
  return (
    <span className="rec-status">
      <StatusPill t={t} movement={entry.movement} status={entry.status} />
      {posting ? <StatusBadge status={posting.status} label={posting.label} /> : null}
    </span>
  )
}

export function Quantity({ t, qty, unit, className }: { t: Translate; qty: Dec | null; unit: UnitBasis; className?: string }): ReactNode {
  return (
    <span className={`rec-qty${className ? ` ${className}` : ''}`}>
      <span className="rec-qty__num">{quantityText(qty)}</span>
      <span className={`rec-qty__unit${unit.name ? '' : ' rec-qty__unit--missing'}`}>{unitText(t, unit)}</span>
    </span>
  )
}

