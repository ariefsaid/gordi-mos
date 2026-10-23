// TransferToSelect — "To": where this transfer goes, as one dropdown grouped by whose books it lands in.
// The options are the destination Locations the database offers (Same branch, then Other branches);
// a destination with something planned today says so.
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n/use-t'
import { isIntraBranch, movementKey } from '@/lib/kitchen-action-label'
import type { KitchenMovement, ProductionStream } from '@/lib/db/kitchen-logs.types'

interface Props {
  value: KitchenMovement
  /** The transfers on offer (Production is not a destination). */
  options: readonly KitchenMovement[]
  origin: ProductionStream | null
  /** Items planned today per movement key. */
  planCounts?: Readonly<Record<string, number>>
  onChange: (next: KitchenMovement) => void
  disabled?: boolean
}

export function TransferToSelect({ value, options, origin, planCounts, onChange, disabled = false }: Props) {
  const t = useT()
  const label = (option: KitchenMovement) => {
    const name = option.toLocationName ?? t('kitchen.actionType.transferTo.fallback')
    const planned = planCounts?.[movementKey(option)] ?? 0
    return planned > 0 ? t('cafe.transfer.destinationPlanned', { label: name, count: planned }) : name
  }
  const same = options.filter(option => isIntraBranch(option, origin))
  const other = options.filter(option => !isIntraBranch(option, origin))
  const chosen = options.some(option => movementKey(option) === movementKey(value)) ? movementKey(value) : ''
  return (
    <div className="cafe-transfer-select">
      <Select
        className="cafe-transfer-select__control"
        fullWidth
        id="cafe-transfer-destination"
        aria-label={t('cafe.transfer.to')}
        value={chosen}
        disabled={disabled}
        onChange={event => {
          const next = options.find(option => movementKey(option) === event.target.value)
          if (next) onChange(next)
        }}
      >
        {chosen === '' && <option value="" disabled>{t('cafe.transfer.choose')}</option>}
        {same.length > 0 && <optgroup label={t('cafe.transfer.group.same')}>
          {same.map(option => <option key={movementKey(option)} value={movementKey(option)}>{label(option)}</option>)}
        </optgroup>}
        {other.length > 0 && <optgroup label={t('cafe.transfer.group.other')}>
          {other.map(option => <option key={movementKey(option)} value={movementKey(option)}>{label(option)}</option>)}
        </optgroup>}
      </Select>
    </div>
  )
}
