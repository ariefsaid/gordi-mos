// WipItemStepper — one capture row per WIP item.
//
// NOTE ON THE NAME: it is no longer a stepper. v4 (owner-corrected 2026-07-27) replaced the
// − / + buttons with a single typed numeric field, because production is entered as a total
// ("mostly 10-20+"), not incremented. The component name is kept for now so the rename is a
// separate, mechanical commit rather than noise inside a design change.
//
// Typed qty field (plan echoed as a greyed placeholder anchor) + `tersedia` context on transfers
// + inline variance-note field (FR-022, revealed on BLUR) + transfer cap cue (FR-023).
// Styling: co-located wip-item-stepper.css (DESIGN.md tokens; no inline style).
// Touch target ≥44px on the phone card (.kls-qty is 44px tall; 16px font so mobile
// Safari does not zoom on focus). The desktop `dense` variant sizes to the 32px control
// height instead (DESIGN.md control height, Data Table 52px row spec) — dense is a
// pointer surface, not a touch target.

import { useState } from 'react'
import type { ItemUnitOption, KitchenLogLine, KitchenMovement } from '@/lib/db/kitchen-logs.types'
import { isStockConsuming, VARIANCE_NOTE_CUE, TRANSFER_SHORT_CUE } from '@/lib/kitchen-gates'
import { useT } from '@/i18n/use-t'
import { Select } from '@/components/ui/select'
import './wip-item-stepper.css'

interface WipItemStepperProps {
  itemName: string
  line: KitchenLogLine
  /** current movement — drives whether the tersedia meta is shown (transfers only) */
  movement: KitchenMovement
  onQtyChange: (qty: number) => void
  onNotesChange: (note: string) => void
  disabled?: boolean
  /** hide the visual name label when the host already shows it (e.g. the shared
   *  DataTable Dish column). itemName is still used for the qty field's aria-label. */
  hideName?: boolean
  /** cafe-3: drop the bordered `.kls-card` box because the HOST already provides one —
   *  the desktop DataTable row, or the phone capture card. Both call sites pass it, so it
   *  is a boxing flag ONLY: it must never carry "this is a pointer surface" behaviour
   *  (control height / type size), which is viewport-scoped in wip-item-stepper.css. */
  dense?: boolean
  /** today's already-logged qty for this (item, movement) on the SELECTED stream — the
   *  running "already logged N" idiom (FR-014, AC-006). 0/omitted → nothing renders. */
  alreadyLogged?: number
  /**
   * The item's OFFERED units (#234, FR-020/021): the confirmed default first, then
   * confirmed transferable alternates — already filtered by the reader (FR-032/AC-015),
   * this component never re-derives offerability. Exactly one (or omitted — hosts that
   * predate unit wiring) → the unit renders as FIXED text and no affordance exists
   * (AC-005); more than one → the quiet "change unit" affordance appears.
   */
  unitOptions?: readonly ItemUnitOption[]
  /** re-bind the line to another offered item-unit (the "change unit" path, FR-021/022). */
  onUnitChange?: (itemUnitId: string) => void
}

export function WipItemStepper({
  itemName,
  line,
  movement,
  onQtyChange,
  onNotesChange,
  disabled = false,
  hideName = false,
  dense = false,
  alreadyLogged = 0,
  unitOptions,
  onUnitChange,
}: WipItemStepperProps) {
  const t = useT()
  // v4: `stok` is no longer read here — both layouts already render Stock as a column/field.
  // `plan_qty` IS read again, but only as the greyed placeholder anchor inside the empty qty
  // field (the live kitchen app's pattern) — never as a duplicated caption beneath it.
  const { qty_porsi, notes, plan_qty: planQty, tersedia, error, capError, dirty } = line
  // v4: the note field and the red invalid border appear on BLUR, not on every keystroke.
  // Typing "18" against a plan of 25 used to flag at "1" and shove a required textarea into the
  // row mid-entry. The live kitchen app hit this exact problem and moved the reveal from `input`
  // to `blur` on the owner's instruction; MOS had regressed to the nagging version. The *variance
  // reading* still updates live — that is the per-menu feedback the owner asked for; it is the
  // mandatory-prose interruption that waits until the field is done.
  const [blurred, setBlurred] = useState(false)
  // The "change unit" picker is CLOSED at rest and opens only on the affordance's own
  // click (FR-021 — the uncommon case is deliberate, never the default path). It closes
  // again on selection or blur: the resting row always reads as fixed text + one small
  // control, whatever happened before.
  const [unitPickerOpen, setUnitPickerOpen] = useState(false)
  // The REVEAL is gated on blur (DD-8). What it must NOT be gated on is `error` staying
  // set: `error` is the *unsatisfied* note gate — kitchen-gates stamps VARIANCE_NOTE_CUE
  // only while `notes` is empty — so `error !== '' && …` made the textarea unmount on the
  // FIRST keystroke inside it. Observed 2026-07-28 at 375x812: type 7 against a plan of 19,
  // blur, click the note, press one key -> notes:"b", error:"", 0 textareas in the DOM,
  // activeElement back on <body>. The floor worker got one character and no field to
  // finish the sentence in, and Submit then unblocked on that one-character "note".
  // Reveal on blur, then KEEP the field open for as long as the line is staged and a note
  // is being written — satisfying the gate must not destroy the control that satisfies it.
  const showNote = dirty && (notes !== '' || (error !== '' && blurred))
  const invalid = (error !== '' || capError !== '') && dirty && blurred
  const transfer = isStockConsuming(movement)
  // The gate logic (kitchen-gates.ts) stamps the canonical ID cue strings onto
  // `error`/`capError`; the display layer maps them through the i18n seam so an
  // English session never mixes locales (cafe-1). Unrecognized values render as-is
  // (defensive — should not occur given the two gate functions above).
  // `error` empties the moment a character is typed (the gate is satisfied), but the cue
  // still has to explain why the field is on screen — so the empty case resolves to the
  // same canonical copy rather than printing a blank line above the textarea.
  const noteCueText = error === '' || error === VARIANCE_NOTE_CUE
    ? t('kitchen.log.stepper.noteCue')
    : error
  const capCueText = capError === TRANSFER_SHORT_CUE ? t('kitchen.log.stepper.capCue') : capError

  // ── The fixed unit + the deliberate "change unit" affordance (#234) ─────────
  // FR-020: the unit beside the qty is MASTER DATA — the line's bound unit (the item's
  // default at rest), never an input. The label falls back to the incumbent 'porsi' for
  // hosts that have not wired units. FR-021/AC-005: only an item with MORE than one
  // offered unit earns the affordance; with exactly one there is nothing to change and
  // nothing renders but the text.
  const boundUnit = unitOptions?.find(u => u.id === line.item_unit_id)
  // A null/stale binding falls back to the item's OWN default unit (then first offered),
  // never straight to the translated 'porsi' — that string is master data only for hosts
  // that pass no units at all (pre-unit wiring), not a guess for items that have some.
  const fallbackUnit = unitOptions?.find(u => u.is_default) ?? unitOptions?.[0]
  const unitLabel = boundUnit?.name ?? fallbackUnit?.name ?? t('kitchen.unit.porsi')
  const offersUnitChange = (unitOptions?.length ?? 0) > 1 && onUnitChange !== undefined

  function handleQtyInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    // Empty clears the entry rather than coercing to 0 — a blank field means "nothing entered
    // yet" and must stay distinguishable from a deliberate zero while typing.
    if (raw === '') { onQtyChange(0); return }
    const val = parseInt(raw, 10)
    if (!Number.isNaN(val) && val >= 0) onQtyChange(val)
  }

  return (
    <div className={`kls-card${dense ? ' kls-dense' : ''}${invalid ? ' kls-invalid' : ''}`}>
      {/* Row: name + typed quantity.
          v4 (owner-corrected 2026-07-27): the −/+ stepper is GONE. Production is not logged
          incrementally — the team types the amount they produced, "mostly 10-20+", so a stepper
          meant ~20 taps per dish across ~21 dishes. This is a fast capture field for record
          keeping, so it mirrors the pattern the live kitchen app already uses on this exact job:
          a right-aligned numeric field with `inputmode=decimal`, blank at rest with the plan
          echoed as a greyed placeholder anchor, a unit label, and `enterkeyhint=next` so a
          phone keyboard walks the list. */}
      <div className="kls-row">
        {!hideName && <span className="kls-name">{itemName}</span>}

        <input
          type="number"
          inputMode="decimal"
          aria-label={t('kitchen.qty.producedAria', { dish: itemName })}
          className="kls-qty"
          value={qty_porsi > 0 ? qty_porsi : ''}
          placeholder={planQty > 0 ? String(planQty) : '0'}
          min={0}
          step={1}
          enterKeyHint="next"
          disabled={disabled}
          data-touch-target="true"
          onChange={handleQtyInput}
          onBlur={() => setBlurred(true)}
        />
        {/* FR-020/021 (#234): the unit is fixed text on the common path. An item with
            alternates gets a SMALL button wearing the same quiet label plus a change
            glyph — one deliberate click opens the picker, selection closes it. An item
            with one unit renders the bare text and NO button (AC-005): nothing to
            change, nothing to mis-tap. */}
        {!offersUnitChange && <span className="kls-unit">{unitLabel}</span>}
        {offersUnitChange && !unitPickerOpen && (
          <button
            type="button"
            className="kls-unit kls-unit-change"
            aria-label={t('kitchen.log.unit.changeAria', { dish: itemName })}
            disabled={disabled}
            onClick={() => setUnitPickerOpen(true)}
          >
            {unitLabel}
            <svg
              aria-hidden="true"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
        {offersUnitChange && unitPickerOpen && (
          <Select
            className="kls-unit-select"
            aria-label={t('kitchen.log.unit.selectAria', { dish: itemName })}
            value={line.item_unit_id ?? ''}
            disabled={disabled}
            autoFocus
            onChange={e => {
              onUnitChange?.(e.target.value)
              setUnitPickerOpen(false)
            }}
            onBlur={() => setUnitPickerOpen(false)}
          >
            {unitOptions?.map(u => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* plan · stok · tersedia context (FR-022/023 basis).
          v4: in `dense` (desktop table) the host already renders Plan and Stock as their own
          columns, so repeating them under the stepper was pure duplication — and it was what
          forced every row to ~90px, pushing the dish list off the first viewport. Dense keeps
          only `tersedia`, which has no column of its own. The phone card floor is unchanged:
          it has no columns, so it still needs the full basis line. */}
      {(transfer || alreadyLogged > 0) && (
        <div className="kls-meta">
          {/* the running "already logged N" (FR-014, AC-006): today's recorded actuals for
              this item + movement on the SELECTED stream — real submitted rows, never the
              typed-but-unsaved quantity (DD-7's line is the form state; this comes from
              the database). Renders only once something HAS been logged. */}
          {alreadyLogged > 0 && (
            <span>{t('kitchen.log.stepper.already')} <strong>{alreadyLogged}</strong></span>
          )}
          {transfer && (
            <span>{t('kitchen.log.stepper.avail')} <strong>{tersedia}</strong></span>
          )}
        </div>
      )}

      {/* Transfer-availability cap cue (FR-023 / AC-022) */}
      {capError && <span role="alert" className="kls-cap">{capCueText}</span>}

      {/* Variance-note gate (FR-022 / AC-020/021) — revealed inline when qty != target */}
      {showNote && (
        <div className="kls-note-wrap">
          <span className="kls-note-cue" id={`note-cue-${line.wip_item_id}`}>{noteCueText}</span>
          {/* v4: the cue was ALSO the textarea's placeholder, printing the same sentence twice in
              the narrowest row in the app. The cue stays (it explains why the field appeared) and
              is now wired to the field via aria-describedby, with aria-required/aria-invalid so a
              screen reader is told the field is mandatory rather than left to infer it. */}
          <textarea
            id={`note-${line.wip_item_id}`}
            aria-label={`Note for ${itemName}`}
            aria-describedby={`note-cue-${line.wip_item_id}`}
            aria-required={true}
            aria-invalid={notes === ''}
            className="kls-note"
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            disabled={disabled}
            rows={2}
          />
        </div>
      )}
    </div>
  )
}
