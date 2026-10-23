import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import type { CafeLocation, CaptureLocations } from '@/lib/db/cafe-locations'
import { LOCATIONS_PATH } from '@/lib/cafe-locations-preview'
import { canAdminCafe } from '@/lib/kitchen-gates'
import './location-preview-fields.css'

type LocationFieldsKind = 'production' | 'waste' | 'count' | 'receive'
export type LocationFieldKey = keyof CaptureLocations
export type LocationChoices = {
  storage: readonly CafeLocation[]
}
export type LocationFieldValues = Pick<CaptureLocations,
  'production_location_id' | 'from_storage_location_id' | 'to_storage_location_id'>
type LocationLoadState = 'loading' | 'ready' | 'error'

const FIELD_LABELS: Record<LocationFieldsKind, MessageKey[]> = {
  production: ['cafe.locations.field.storeOutput'],
  waste: ['cafe.locations.field.storage'],
  count: ['cafe.locations.field.storage'],
  receive: ['cafe.locations.field.storeIn'],
}

function ManageLink() {
  const t = useT()
  const auth = useAuth()
  const isAdmin = auth.status === 'authenticated' && canAdminCafe(auth.viewer.accessRoles)
  return isAdmin ? <Link className="loc-fields__link" to={LOCATIONS_PATH}>{t('cafe.locations.manage')}</Link> : null
}

function LocationSelect({
  label,
  locations,
  value,
  disabled,
  onChange,
  inheritDefault = false,
}: {
  label: string
  locations: readonly CafeLocation[]
  value: string | null | undefined
  disabled: boolean
  onChange: (value: string | null | undefined) => void
  inheritDefault?: boolean
}) {
  const t = useT()
  const selectValue = value === undefined && inheritDefault ? 'default' : value ?? 'none'
  return (
    <Select label={label} value={selectValue} disabled={disabled} fullWidth onChange={event => {
      const selected = event.currentTarget.value
      onChange(selected === 'default' ? undefined : selected === 'none' ? null : selected)
    }}>
      {inheritDefault && <option value="default">{t('cafe.locations.useDeliveryDefault')}</option>}
      <option value="none">{t('cafe.locations.unassigned')}</option>
      {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
    </Select>
  )
}

function LoadNotice({ state, onRetry }: { state: LocationLoadState; onRetry?: () => void }) {
  const t = useT()
  if (state === 'ready') return null
  return (
    <p className="loc-fields__note" role={state === 'error' ? 'alert' : 'status'}>
      {t(state === 'error' ? 'cafe.locations.loadError' : 'cafe.locations.loading')}
      {state === 'error' && onRetry && <> <button type="button" className="loc-fields__retry" onClick={onRetry}>{t('common.retry')}</button></>}
    </p>
  )
}

/** Fields sit beside the action that commits them; each selector is optional and starts Unassigned. */
export function LocationPanelFields({
  kind,
  locations,
  values,
  onChange,
  loadState = 'ready',
  onRetry,
  disabled = false,
}: {
  kind: 'production' | 'receive'
  locations: LocationChoices
  values: LocationFieldValues
  onChange: (field: LocationFieldKey, value: string | null | undefined) => void
  loadState?: LocationLoadState
  onRetry?: () => void
  disabled?: boolean
}) {
  const t = useT()
  const auth = useAuth()
  const canManage = auth.status === 'authenticated' && canAdminCafe(auth.viewer.accessRoles)
  const unavailable = disabled || loadState !== 'ready'
  // Production is stored in the Location the person is working at, and a transfer names its two ends on
  // the page itself; the only place left to choose is where stock is put.
  const fields = [{ key: 'to_storage_location_id' as const, options: locations.storage }]
  return (
    <div className="loc-fields loc-fields--panel" role="group" aria-label={t('cafe.locations.fields')}>
      {fields.map(({ key, options }, index) => (
        <LocationSelect
          key={key}
          label={t(FIELD_LABELS[kind][index]!)}
          locations={options}
          value={values[key]}
          disabled={unavailable}
          onChange={value => onChange(key, value)}
        />
      ))}
      {kind === 'receive' && <p className="loc-fields__note">{t('cafe.locations.receive.default')}</p>}
      <LoadNotice state={loadState} onRetry={onRetry} />
      {canManage && <ManageLink />}
    </div>
  )
}

type LocationLineProps = {
  locations: readonly CafeLocation[]
  value: string | null | undefined
  onChange: (value: string | null | undefined) => void
  loadState?: LocationLoadState
  onRetry?: () => void
  disabled?: boolean
}

function LocationLineSelect({ kind, locations, value, onChange, loadState = 'ready', onRetry, disabled = false, inheritDefault = false }: LocationLineProps & {
  kind: 'waste' | 'count' | 'receive'
  inheritDefault?: boolean
}) {
  const t = useT()
  return <>
    <LocationSelect label={t(FIELD_LABELS[kind][0]!)} locations={locations} value={value}
      disabled={disabled || loadState !== 'ready'} onChange={onChange} inheritDefault={inheritDefault} />
    <LoadNotice state={loadState} onRetry={onRetry} />
  </>
}

/** Waste and Count storage is decided on the line after its amount is entered. */
export function LocationLineField(props: LocationLineProps & { kind: 'waste' | 'count' }) {
  const t = useT()
  return (
    <div className="loc-fields loc-fields--line" role="group" aria-label={t(FIELD_LABELS[props.kind][0]!)}>
      <LocationLineSelect {...props} />
    </div>
  )
}

/** Receive line override: undefined inherits the delivery default; null is explicitly Unassigned. */
export function LocationLineOverride(props: LocationLineProps) {
  const t = useT()
  return (
    <details className="loc-fields loc-fields--override">
      <summary>{t('cafe.locations.lineOverride')}</summary>
      <LocationLineSelect {...props} kind="receive" inheritDefault />
    </details>
  )
}

// Records and stock projections are added only when their real read models are loaded.
export function LocationRecordsFilter() { return null }
export function LocationBalanceSection() { return null }
