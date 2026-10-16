// MovementSeg — the capture surface's scope control: which MOVEMENT the list is being logged
// against (DD-WAY-13). It is the shared SegmentedControl; this file only derives the options.
//
// The options are DERIVED from the branch catalog — produce, then a transfer to each branch — and
// their labels come from the same derivation the database owns (`ops.kitchen_action_label`). The
// one option whose destination is the origin's own branch is the intra-branch cross-activity
// movement (FR-013); it says which activity it goes to ("Transfer to Gordi HQ · Kitchen") on the
// same line, so every segment is one line tall. The stored row, the batch prefix and the ERP
// endpoint still compare branches only (FR-051).
import type { BranchOption, KitchenMovement, ProductionStream } from '@/lib/db/kitchen-logs.types'
import {
  activityLabel,
  counterpartActivity,
  deriveActionLabel,
  isIntraBranch,
  movementKey,
  movementsEqual,
} from '@/lib/kitchen-action-label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useT } from '@/i18n/use-t'
import './movement-seg.css'

interface MovementSegProps {
  value: KitchenMovement
  /** derived by the caller from the branch catalog (`movementsForStream`) */
  options: readonly KitchenMovement[]
  /** the catalog the labels are derived against */
  branches: readonly BranchOption[]
  /** The ORIGIN stream, so the intra-branch option can say which activity it goes to. */
  origin?: ProductionStream | null
  /** Visible label above the control, when no nearby heading names it. */
  label?: string
  onChange: (value: KitchenMovement) => boolean | void
  disabled?: boolean
  /** Items planned today per movement key; a destination with a plan says so ("· 3 planned"). */
  planCounts?: Readonly<Record<string, number>>
}

export function MovementSeg({ value, options, branches, origin = null, label, onChange, disabled = false, planCounts }: MovementSegProps) {
  const t = useT()
  const counterpart = origin ? activityLabel(t, counterpartActivity(origin.activity)) : ''
  return (
    <SegmentedControl
      className="movement-seg"
      label={label}
      ariaLabel={t('kitchen.actionType.aria')}
      options={options.map(option => {
        const base = deriveActionLabel(t, option, branches)
        const intra = isIntraBranch(option, origin)
        const label = intra ? `${base} · ${counterpart}` : base
        const planned = planCounts?.[movementKey(option)] ?? 0
        return {
          value: movementKey(option),
          label: planned > 0 ? t('cafe.transfer.destinationPlanned', { label, count: planned }) : label,
        }
      })}
      value={options.find(option => movementsEqual(option, value)) ? movementKey(value) : null}
      onChange={key => {
        const next = options.find(option => movementKey(option) === key)
        if (next) onChange(next)
      }}
      disabled={disabled}
    />
  )
}
