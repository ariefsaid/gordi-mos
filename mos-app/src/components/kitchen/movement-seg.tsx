// MovementSeg — the capture surface's scope control: which MOVEMENT the list is being
// logged against (DD-WAY-13).
//
// A DERIVED SCOPE STRIP (DESIGN.md § Tabs / Segmented Controls, A7): the options come from
// the origin-aware helper (`movementsForStream(origin, catalog)`) — produce, then a transfer
// to each destination the DATABASE's derivation says this stream is allowed to send to. This
// strip never enumerates the whole branch catalog: a Café stream sends only to the branches
// listed on `ops.allowed_kitchen_destinations` (#782/#777), so the receive-only Radiant
// kitchen offers nothing, Roastery is never a destination, and Cikal · bar carries no
// intra-branch tab because its counterpart kitchen stream does not exist.
//
// It is also the DESTINATION picker, and that is the whole of one (FR-013): both movement
// classes come out of one derived list because a destination is a branch and only a branch
// (OD-WAY-44). Every branch but the origin is a cross-branch transfer; the origin itself is
// the intra-branch cross-activity movement, offered from the bar surface when the origin's
// own kitchen stream exists (the only case its counterpart is defined), and qualified with
// the counterpart activity so the person can tell it apart from a cross-branch entry.
//
// Label is `→ Branch` — the short arrow form, at every width. The tab is a compact scope
// chip in a segmented strip, not a sentence; a long "Transfer to X" wrapped or hit the
// ellipsis on the phone, and "Transfer to Ra…" is exactly the ambiguity the arrow form
// exists to remove. The full-sentence localisation still rides on the accessible name so
// screen readers hear "Transfer to Radiant", not "arrow Radiant".
//
// role="tablist" with role="tab" children; aria-selected marks the current scope. The strip
// scrolls horizontally in its own box rather than wrapping or overflowing the page (A7 —
// "above five options the strip is wrong and the derivation is fixed, not the layout"), so
// a catalog that grows a fifth option still reaches every tab with one thumb.
// Styling: co-located movement-seg.css.

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
  /** derived by the caller from the origin-aware helper (`movementsForStream(origin, catalog)`) */
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
        // counterpart activity it says what the movement actually is (bar → our kitchen). The
        // qualifier is DERIVED FOR DISPLAY: the stored row, the batch prefix and the ERP
        // endpoint all still compare branches only (FR-051), and the full-sentence label the
        // AT layer reads is unchanged, so the mirror of `ops.kitchen_action_label` stays
        // byte-identical on both sides of the seam (OD-K-1 parity).
        const intra = isIntraBranch(option, origin)
        const counterpart = origin ? activityLabel(t, counterpartActivity(origin.activity)) : ''
        // Visible: `→ Branch` — the short arrow form (A7). Accessible: the full sentence, so
        // AT users hear "Transfer to X" instead of the strip's chevron read aloud.
        const shortLabel = deriveActionShortLabel(t, option, branches)
        const fullLabel = deriveActionLabel(t, option, branches)
        const qualifier = t('kitchen.actionType.intraBranch', { activity: counterpart })
        const accessibleName = intra ? `${fullLabel} ${qualifier}` : fullLabel
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
            <span className="kms-label" aria-hidden="true">{shortLabel}</span>
            {intra && (
              <span className="kms-qual" aria-hidden="true">
                {t('kitchen.actionType.intraBranch.short', { activity: counterpart })}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
