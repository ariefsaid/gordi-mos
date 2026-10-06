import { useT } from '@/i18n/use-t'
import type { CafeReceivableItem } from '@/lib/db/cafe-receipts'
import { kitchenCategoryLabel } from '@/lib/kitchen-category-label'

export type CafeItemQuantityEntry = { quantity: string; unitId: string; changingUnit: boolean }

/**
 * One compact capture row (DESIGN "Compact capture row"): item identity, a typed decimal box with
 * the ESB unit fixed beside it, and a deliberate change-unit control only when the item has more
 * than one ESB unit. The entry carries the chosen product detail; quantities are never converted.
 */
export function CafeItemQuantityRow({
  item,
  entry,
  idPrefix,
  quantityLabel,
  quantityFor,
  invalid,
  disabled,
  onChange,
}: {
  item: CafeReceivableItem
  entry: CafeItemQuantityEntry | undefined
  idPrefix: string
  quantityLabel: string
  quantityFor: string
  invalid: boolean
  disabled: boolean
  onChange: (patch: Partial<CafeItemQuantityEntry>) => void
}) {
  const t = useT()
  const inputId = `${idPrefix}-${item.id}`
  const errorId = `${inputId}-error`
  const unitName = item.units.find(unit => unit.id === entry?.unitId)?.name ?? ''
  return (
    <li className="cafe-count__row">
      <div className="cafe-count__item">
        <div className="cafe-count__item-name">{item.name}</div>
        {item.category && <div className="cafe-count__category">{kitchenCategoryLabel(t, item.category)}</div>}
      </div>
      <div className="cafe-count__input-group">
        <label htmlFor={inputId}>{quantityLabel}</label>
        <div className="cafe-count__quantity-control">
          <input
            id={inputId}
            aria-label={quantityFor}
            type="text"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            value={entry?.quantity ?? ''}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            disabled={disabled}
            onChange={event => onChange({ quantity: event.target.value })}
          />
          <span className="cafe-count__unit">{unitName}</span>
        </div>
        {item.units.length > 1 && (
          <button
            type="button"
            className="cafe-receive__change-unit"
            aria-expanded={entry?.changingUnit ?? false}
            disabled={disabled}
            onClick={() => onChange({ changingUnit: !entry?.changingUnit })}
          >
            {t('cafe.receive.changeUnit')}
          </button>
        )}
        {item.units.length > 1 && entry?.changingUnit && (
          <fieldset className="cafe-receive__units" aria-label={t('cafe.receive.unitFor', { item: item.name })}>
            <legend>{t('cafe.receive.unitLabel')}</legend>
            {item.units.map(unit => (
              <label key={unit.id}>
                <input
                  type="radio"
                  name={`${inputId}-unit`}
                  value={unit.id}
                  checked={entry.unitId === unit.id}
                  disabled={disabled}
                  onChange={() => onChange({ unitId: unit.id })}
                />
                {unit.name}
              </label>
            ))}
          </fieldset>
        )}
        {invalid && <p id={errorId} className="cafe-count__field-error">{t('cafe.receive.quantityInvalid')}</p>}
      </div>
    </li>
  )
}
