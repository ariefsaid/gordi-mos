// MovementSeg — the capture surface's scope control: which MOVEMENT the list is being
// logged against (DD-WAY-13).
//
// It replaces v4's ActionTypeSeg on the Log surface. That control hardcoded the incumbent's
// three label literals as its option list, which is the stored-three-literal model in the UI
// layer: it cannot offer a movement for the four (branch, activity) streams that reach the
// ERP on paper today, and the squashed baseline has no column for it to read. Here the
// options are DERIVED — produce, then a transfer to each branch in the canonical catalog —
// and their labels come from the same derivation the database owns
// (`ops.kitchen_action_label`). For the two currently-captured streams the rendered strings
// are byte-identical to the incumbent's, so OD-K-1 behavioural parity holds.
//
// role="tablist" with role="tab" children; aria-selected marks the current scope. The strip
// scrolls horizontally rather than wrapping, so a catalog longer than the phone is wide
// still reaches every option with one thumb. Styling: co-located movement-seg.css.

import type { BranchOption, KitchenMovement } from '@/lib/db/kitchen-logs.types'
import {
  deriveActionLabel,
  deriveActionShortLabel,
  movementKey,
  movementsEqual,
} from '@/lib/kitchen-action-label'
import { useT } from '@/i18n/use-t'
import './movement-seg.css'

interface MovementSegProps {
  value: KitchenMovement
  /** derived by the caller from the branch catalog (`movementsForStream`) */
  options: readonly KitchenMovement[]
  /** the catalog the labels are derived against */
  branches: readonly BranchOption[]
  onChange: (value: KitchenMovement) => void
  disabled?: boolean
}

export function MovementSeg({
  value,
  options,
  branches,
  onChange,
  disabled = false,
}: MovementSegProps) {
  const t = useT()
  return (
    <div role="tablist" aria-label={t('kitchen.actionType.aria')} className="kms">
      {options.map((option) => {
        const isSelected = movementsEqual(option, value)
        return (
          <button
            key={movementKey(option)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            disabled={disabled}
            className="kms-tab"
            onClick={() => {
              if (!isSelected) onChange(option)
            }}
          >
            <span className="kms-full">{deriveActionLabel(t, option, branches)}</span>
            <span className="kms-short" aria-hidden="true">
              {deriveActionShortLabel(t, option, branches)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
