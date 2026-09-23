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
// It is also the DESTINATION picker, and that is the whole of one (FR-013): both movement
// classes come out of one derived list because a destination is a branch and only a branch
// (OD-WAY-44). Every branch but the origin is a cross-branch transfer; the origin itself is
// the intra-branch cross-activity movement, offered identically from the bar surface and the
// kitchen surface, and qualified with the counterpart activity so the person can tell it
// apart from the branch's cross-branch entry. That qualifier is display, not a dimension.
//
// role="tablist" with role="tab" children; aria-selected marks the current scope. The strip
// scrolls horizontally rather than wrapping, so a catalog longer than the phone is wide
// still reaches every option with one thumb. Styling: co-located movement-seg.css.

import type {
  BranchOption,
  KitchenMovement,
  ProductionStream,
} from '@/lib/db/kitchen-logs.types'
import {
  activityLabel,
  counterpartActivity,
  deriveActionLabel,
  deriveActionShortLabel,
  isIntraBranch,
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
  /**
   * The ORIGIN stream, so the one option whose destination is the origin's own branch can be
   * read for what it is: the intra-branch cross-activity movement (FR-013). Optional — with
   * no resolved stream (FR-002) nothing is intra-branch yet and every option renders plain.
   */
  origin?: ProductionStream | null
  onChange: (value: KitchenMovement) => void
  disabled?: boolean
}

export function MovementSeg({
  value,
  options,
  branches,
  origin = null,
  onChange,
  disabled = false,
}: MovementSegProps) {
  const t = useT()
  return (
    <div role="tablist" aria-label={t('kitchen.actionType.aria')} className="kms">
      {options.map((option) => {
        const isSelected = movementsEqual(option, value)
        // FR-013: the destination is a branch and only a branch (OD-WAY-44), so from the bar
        // surface and the kitchen surface alike the intra-branch option IS the same catalog
        // entry — "transfer to my own branch". Unqualified, a barista reads it as their own
        // branch's name and cannot tell it apart from a cross-branch move; qualified with the
        // counterpart activity it says what the movement actually is (bar → our kitchen,
        // kitchen → our bar). The qualifier is DERIVED FOR DISPLAY: the stored row, the batch
        // prefix and the ERP endpoint all still compare branches only (FR-051), and the
        // derived label itself is untouched, so the mirror of `ops.kitchen_action_label`
        // stays byte-identical on both sides of the seam (OD-K-1 parity).
        const intra = isIntraBranch(option, origin)
        const counterpart = origin ? activityLabel(t, counterpartActivity(origin.activity)) : ''
        const label = deriveActionLabel(t, option, branches)
        const qualifier = t('kitchen.actionType.intraBranch', { activity: counterpart })
        // The tab NAMES ITSELF. Both label spans below are viewport-swapped by CSS (the full
        // one is display:none under 400px, the short one is aria-hidden above it), so leaving
        // the name to the contents makes it depend on the viewport — and on the phone width
        // this surface is built for, that leaves the tab with no accessible name at all.
        const accessibleName = intra ? `${label} ${qualifier}` : label
        return (
          <button
            key={movementKey(option)}
            type="button"
            role="tab"
            aria-label={accessibleName}
            aria-selected={isSelected}
            disabled={disabled}
            className="kms-tab"
            onClick={() => {
              if (!isSelected) onChange(option)
            }}
          >
            <span className="kms-full">{label}</span>
            <span className="kms-short" aria-hidden="true">
              {deriveActionShortLabel(t, option, branches)}
            </span>
            {intra && (
              <>
                <span className="kms-qual">{qualifier}</span>
                <span className="kms-qual-short" aria-hidden="true">
                  {t('kitchen.actionType.intraBranch.short', { activity: counterpart })}
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
