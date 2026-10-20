// WipItemEntry / WipItemDetail — the two halves of one Production/Transfer capture row, placed by CaptureRow.
// Entry: the typed quantity box + fixed unit (the quiet "change unit" choice only when the item offers more than one).
// Detail: recorded history, the transfer cap cue and the variance note the gate asks for.
// Styling: the box and unit tracks come from capture-row.css; co-located wip-item-entry.css keeps the rest.

import { useEffect, useRef, useState } from 'react'
import type { ActualUnitTotal, ItemUnitOption, KitchenLogLine, KitchenMovement } from '@/lib/db/kitchen-logs.types'
import { formatQuantityWithUnit, formatUnitMultiple } from '@/lib/cafe-unit-multiples'
import { isStockConsuming, VARIANCE_NOTE_CUE, TRANSFER_SHORT_CUE } from '@/lib/kitchen-gates'
import { useT } from '@/i18n/use-t'
import { Select } from '@/components/ui/select'
import { QuantityField } from '@/components/ui/quantity-field'
import './wip-item-entry.css'

const actualQuantityFormatters = new Map<string, Intl.NumberFormat>()

function formatActualQuantity(quantity: number, locale: string): string {
  let formatter = actualQuantityFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 })
    actualQuantityFormatters.set(locale, formatter)
  }
  return formatter.format(quantity)
}

interface WipItemEntryProps {
  itemName: string
  line: KitchenLogLine
  /** Current movement — identifies transfer quantity labels and stock-consuming cap context. */
  movement: KitchenMovement
  /** destination branch name for a transfer quantity's accessible label */
  destinationName?: string
  onQtyChange: (qty: number) => void
  disabled?: boolean
  /**
   * The item's OFFERED units (#234, FR-020/021): the confirmed default first, then
   * confirmed transferable alternates — already filtered by the reader (FR-032/AC-015),
   * this component never re-derives offerability. Exactly one (or omitted — hosts that
   * predate unit wiring) → the unit renders as FIXED text and no affordance exists
   * (AC-005); more than one → the quiet "change unit" affordance appears.
   */
  unitOptions?: readonly ItemUnitOption[]
  /** Manager-defined factors relative to the ERP default unit, never ERP unit rows. */
  unitMultiples?: readonly number[]
  /** Change the selected ERP unit or manager-defined multiple. */
  onUnitChange?: (unitChoice: string) => void
  /** Reports whether this row currently contains a valid quantity draft. */
  onQuantityValidityChange?: (valid: boolean) => void
  /** The draft text is kept outside the row while table filters unmount it. */
  invalidDraft?: string
  onInvalidQuantityDraft?: (raw: string) => void
  onQuantityErrorVisibilityChange?: (visible: boolean) => void
  /** The page renders the field's error in the row's detail line (QuantityFieldError, same id). */
  quantityErrorId?: string
  /** Explicitly resets the field's local raw draft when the page discards capture state. */
  resetKey?: number
}

interface WipItemDetailProps {
  itemName: string
  line: KitchenLogLine
  movement: KitchenMovement
  onNotesChange: (note: string) => void
  disabled?: boolean
  alreadyLogged?: readonly ActualUnitTotal[]
  unitOptions?: readonly ItemUnitOption[]
  /** The person has tried to move on (footer pointer); only then does a missing note read as an error. */
  noteAttempted?: boolean
}

function formatLoggedEntry(
  entry: ActualUnitTotal,
  formatQuantity: (quantity: number) => string,
  unknownUnit: string,
): string {
  const locale = document.documentElement.lang || 'en'
  if (entry.entry_quantity == null || entry.entry_unit_name == null) {
    return formatQuantityWithUnit(entry.qty_porsi, entry.unit_name?.trim() || unknownUnit, locale)
  }
  const factor = entry.entry_unit_factor ?? 1
  const unit = factor === 1
    ? entry.entry_unit_name
    : formatUnitMultiple(factor, entry.entry_unit_name, locale)
  return factor === 1
    ? formatQuantityWithUnit(entry.entry_quantity, unit, locale)
    : `${formatQuantity(entry.entry_quantity)} × ${unit}`
}

export function WipItemEntry({
  itemName,
  line,
  movement,
  destinationName,
  onQtyChange,
  disabled = false,
  unitOptions,
  unitMultiples = [],
  onUnitChange,
  onQuantityValidityChange,
  invalidDraft,
  onInvalidQuantityDraft,
  onQuantityErrorVisibilityChange,
  quantityErrorId,
  resetKey,
}: WipItemEntryProps) {
  const t = useT()
  const { qty_porsi } = line
  // The "change unit" picker is CLOSED at rest and opens only on the affordance's own
  // click (FR-021 — the uncommon case is deliberate, never the default path). It closes
  // again on selection or blur: the resting row always reads as fixed text + one small
  // control, whatever happened before.
  const [unitPickerOpen, setUnitPickerOpen] = useState(false)
  const unitChangeButtonRef = useRef<HTMLButtonElement>(null)
  const restoreUnitFocus = useRef(false)
  useEffect(() => {
    if (!unitPickerOpen && restoreUnitFocus.current) {
      restoreUnitFocus.current = false
      unitChangeButtonRef.current?.focus()
    }
  }, [unitPickerOpen])
  const transfer = isStockConsuming(movement)

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
  const locale = document.documentElement.lang || 'en'
  const selectedFactor = line.entry_unit_factor ?? 1
  const selectedMultipleLabel = selectedFactor !== 1 && unitMultiples.includes(selectedFactor)
    ? formatUnitMultiple(selectedFactor, fallbackUnit?.name ?? '', locale)
    : null
  const unitLabel = selectedMultipleLabel ?? boundUnit?.name ?? fallbackUnit?.name ?? (unitOptions === undefined ? t('kitchen.unit.porsi') : '')
  const selectedUnitValue = selectedMultipleLabel
    ? `multiple:${String(selectedFactor)}`
    : line.item_unit_id ?? ''
  const offersUnitChange = ((unitOptions?.length ?? 0) > 1 || unitMultiples.length > 0) && onUnitChange !== undefined
  const unitSuffix = !offersUnitChange
    ? unitLabel ? <span className="kls-unit" title={unitLabel}>{unitLabel}</span> : undefined
    : unitPickerOpen ? (
        <Select
          className="kls-unit-select"
          contentClassName="kls-unit-menu"
          aria-label={`${t('kitchen.log.unit.selectAria', { item: itemName })}: ${unitLabel}`}
          title={unitLabel}
          value={selectedUnitValue}
          disabled={disabled}
          autoFocus
          onChange={e => {
            restoreUnitFocus.current = true
            onUnitChange?.(e.target.value)
            setUnitPickerOpen(false)
          }}
          onBlur={() => setUnitPickerOpen(false)}
        >
          {unitOptions?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          {unitMultiples.map(factor => (
            <option key={`multiple:${factor}`} value={`multiple:${String(factor)}`}>
              {formatUnitMultiple(factor, fallbackUnit?.name ?? '', locale)}
            </option>
          ))}
        </Select>
      ) : (
        <button
          ref={unitChangeButtonRef}
          type="button"
          className="kls-unit kls-unit-change"
          aria-label={`${t('kitchen.log.unit.changeAria', { item: itemName })}: ${unitLabel}`}
          title={unitLabel}
          disabled={disabled}
          onClick={() => setUnitPickerOpen(true)}
        >
          <span>{unitLabel}</span>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )
  const entryQuantity = line.entry_quantity ?? qty_porsi

  // Production is typed as a total ("mostly 10-20+"), never incremented: one right-aligned numeric field with
  // `inputmode=decimal`, a neutral zero placeholder, the unit beside it, and `enterkeyhint=next` so a phone keyboard
  // walks the list. Plan and stock are the row's figures; the field starts empty (a plan in the field read as
  // already entered); the person types the actual quantity.
  return (
    <QuantityField
      id={`quantity-${line.wip_item_id}`}
      label={transfer
        ? `${t('kitchen.qty.transferAria', {
          branch: destinationName ?? t('kitchen.actionType.transferTo.fallback'),
          item: itemName,
        })} · ${unitLabel}`
        : `${t('kitchen.qty.producedAria', { item: itemName })} · ${unitLabel}`}
      className="kls-qty"
      value={entryQuantity}
      onChange={onQtyChange}
      onInvalid={(_reason, raw) => { onQtyChange(0); onInvalidQuantityDraft?.(raw) }}
      onValidityChange={onQuantityValidityChange}
      onErrorVisibilityChange={onQuantityErrorVisibilityChange}
      hideError
      errorMessageId={quantityErrorId}
      initialDraft={invalidDraft}
      resetKey={resetKey}
      suffix={unitSuffix}
      suffixPosition="inline"
      placeholder="0"
      min={0}
      maxIntegerDigits={10}
      maxFractionDigits={2}
      enterKeyHint="next"
      disabled={disabled}
      touchTarget
    />
  )
}

/** The row's detail line: today's recorded actuals, the transfer cap cue, and the variance note the gate asks for. */
export function WipItemDetail({
  itemName,
  line,
  movement,
  onNotesChange,
  disabled = false,
  alreadyLogged = [],
  unitOptions,
  noteAttempted = false,
}: WipItemDetailProps) {
  const t = useT()
  const { notes, error, capError, dirty } = line
  // The note control must appear with the live gate: Submit is disabled as soon as an off-plan quantity is
  // staged, so waiting for blur would leave a focused worker with a disabled action and no control that can
  // satisfy it. It stays mounted after the first note character and while the gate is unsatisfied.
  const showNote = dirty && (notes !== '' || error !== '')
  const transfer = isStockConsuming(movement)
  // The gate logic (kitchen-gates.ts) stamps the canonical ID cue strings onto `error`/`capError`; the display
  // layer maps them through the i18n seam so an English session never mixes locales (cafe-1).
  const noteCueText = error === VARIANCE_NOTE_CUE
    ? t('kitchen.log.stepper.noteCue')
    : error === ''
      ? notes.trim() ? t('kitchen.log.stepper.noteReady') : t('kitchen.log.stepper.noteCue')
      : error
  const formatActualQty = (quantity: number) => formatActualQuantity(quantity, document.documentElement.lang || 'en')
  const unitLabel = (unitOptions?.find(u => u.id === line.item_unit_id) ?? unitOptions?.find(u => u.is_default) ?? unitOptions?.[0])?.name ?? ''
  // Say how much IS available and why today's production is not in it yet (it counts once a lead approves it).
  const availableUnit = (unitOptions?.find(u => u.is_default) ?? unitOptions?.[0])?.name ?? unitLabel
  const capCueText = capError === TRANSFER_SHORT_CUE
    ? t('kitchen.log.stepper.capCue', { n: formatActualQty(line.tersedia), unit: availableUnit })
    : capError

  return (
    <>
      {alreadyLogged.length > 0 && (
        <div className="kls-meta">
          {/* the running "already logged N" (FR-014, AC-006): today's recorded actuals for this item + movement on the
              SELECTED stream — real submitted rows, never the typed-but-unsaved quantity. */}
          <span>
            {t('kitchen.log.stepper.already')} <strong className="kls-logged-units">
              {alreadyLogged.map(entry => (
                <span className="kls-logged-unit" key={entry.key}>
                  {formatLoggedEntry(entry, formatActualQty, t('kitchen.log.unit.unknownHistory'))}
                </span>
              ))}
            </strong>
          </span>
        </div>
      )}

      {/* Transfer-availability cap cue (FR-023 / AC-022) */}
      {capError && <span role="alert" className="kls-cap">{capCueText}</span>}
      {capError && transfer && line.stok > 0 && line.tersedia === 0 && (
        <p className="kls-availability-note" role="status">{t('kitchen.transfer.availabilityCut')}</p>
      )}

      {/* Variance-note gate (FR-022 / AC-020/021) — revealed inline when qty != target. The field has a visible
          label of its own; the cue is helper text below it and only reads as an error while still required. */}
      {showNote && (
        <div className="kls-note-wrap">
          <label className="kls-note-label" htmlFor={`note-${line.wip_item_id}`}>
            {t('kitchen.log.stepper.noteLabel')}
          </label>
          <textarea
            id={`note-${line.wip_item_id}`}
            aria-label={t('kitchen.log.stepper.noteAria', { item: itemName })}
            aria-describedby={`note-cue-${line.wip_item_id}`}
            aria-required={true}
            aria-invalid={notes === '' && noteAttempted}
            className="kls-note"
            // Capture runs qty -> qty down the list: an empty note is reached from the footer pointer (which focuses
            // it) or a click; once it has text it is a normal tab stop.
            tabIndex={notes === '' ? -1 : undefined}
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            disabled={disabled}
            rows={2}
            cols={1}
          />
          <span
            className={`kls-note-cue${notes === '' && noteAttempted ? ' kls-note-cue--error' : ''}`}
            id={`note-cue-${line.wip_item_id}`}
          >
            {noteCueText}
          </span>
        </div>
      )}
    </>
  )
}
