// KitchenLogRow — one desktop <tr> (plan §4.1 N6, §8.1). 50px dense OD-P3-6 row.
// Cells: Dish (name + category) · Plan · Stock · <QtyCell> · <Pill> status.
// Reveals a second <tr class="klr-note-row"> with the note <textarea> when
// line.error && line.dirty (FR-022). Token-only (DESIGN.md); Tinted-Status dot+pill.

import type { WipItemOption, KitchenLogLine, KitchenActionType } from '@/lib/db/kitchen-logs.types'
import { kitchenStatus } from '@/lib/kitchen-status'
import { QtyCell } from './qty-cell'
import { Pill } from '@/components/ui/pill'
import './kitchen-log-row.css'

interface KitchenLogRowProps {
  item: WipItemOption
  line: KitchenLogLine
  actionType: KitchenActionType
  onQtyChange: (qty: number) => void
  onNotesChange: (note: string) => void
  disabled?: boolean
}

export function KitchenLogRow({
  item, line, actionType, onQtyChange, onNotesChange, disabled = false,
}: KitchenLogRowProps) {
  const { qty_porsi: qty, plan_qty: plan, stok, error, dirty, notes } = line
  const showNote = error !== '' && dirty
  const status = kitchenStatus({ made: qty, plan, isOffPlan: plan <= 0 })

  return (
    <>
      <tr className="klr">
        <th scope="row" className="klr-dish">
          <span className="klr-name">{item.name}</span>
          {item.category && <span className="klr-cat">{item.category}</span>}
        </th>
        <td className="klr-num klr-plan tabular-nums">{plan > 0 ? plan : '—'}</td>
        <td className="klr-num klr-stock tabular-nums">{stok}</td>
        <td className="klr-made">
          <QtyCell itemName={item.name} line={line} actionType={actionType} onQtyChange={onQtyChange} disabled={disabled} />
        </td>
        <td className="klr-status">
          <Pill tone={status.tone} dot={status.dot ?? true}>{status.label}</Pill>
        </td>
      </tr>
      {showNote && (
        <tr className="klr-note-row">
          <td colSpan={5}>
            <div className="klr-note-wrap">
              <span className="klr-note-cue">{error}</span>
              <textarea
                aria-label={`Note for ${item.name}`}
                className="klr-note"
                value={notes}
                onChange={e => onNotesChange(e.target.value)}
                disabled={disabled}
                rows={2}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
