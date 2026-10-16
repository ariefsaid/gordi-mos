// Locations on existing pages (PREVIEW). Every embedded location field, filter or section on a released page
// is rendered through this file and asked of the SAME ship authority as the /cafe/locations route: with the
// preview opt-in off (every production build) each export returns null, so the released page is unchanged.
// While Location tracking is not connected the fields are disabled and read "— · Not recorded"; nothing is
// sent, no stub is called and no location id joins a payload (R/handover/locations.md "Acceptance").
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { LOCATIONS_PREVIEW_ROOT, CHANGE_LOCATION_PATH, useLocationsPreview, type RecordLocationKey } from '@/lib/cafe-locations-preview'
import './location-preview-fields.css'

export type LocationFieldsKind = 'production' | 'transfer' | 'waste' | 'count' | 'receive'
const FIELDS: Record<LocationFieldsKind, MessageKey[]> = {
  production: ['cafe.locations.field.production', 'cafe.locations.field.storeOutput'],
  transfer: ['cafe.locations.field.from', 'cafe.locations.field.to'],
  waste: ['cafe.locations.field.storage'],
  count: ['cafe.locations.field.storage'],
  receive: ['cafe.locations.field.storeIn'],
}

/** A disabled select that can only say "— · Not recorded". */
function NotRecordedSelect({ label }: { label: string }) {
  const t = useT()
  return (
    <Select label={label} value="none" disabled fullWidth>
      <option value="none">{t('cafe.locations.notRecordedValue')}</option>
    </Select>
  )
}

function ManageLink() {
  const t = useT()
  const auth = useAuth()
  const isAdmin = auth.status === 'authenticated' && auth.viewer.accessRoles.includes('admin')
  return isAdmin ? <Link className="loc-fields__link" to={LOCATIONS_PREVIEW_ROOT}>{t('cafe.locations.manage')}</Link> : null
}

/** A field belongs at the step where the decision is made. Panel fields sit in the summary panel beside Submit / Lock (Receive: "Store in" for the whole
    delivery; Production: where it is made and where the output goes; Transfer: From / To storage). */
export function LocationPanelFields({ kind }: { kind: LocationFieldsKind }) {
  const on = useLocationsPreview()
  return on ? <PanelFields kind={kind} /> : null
}

function PanelFields({ kind }: { kind: LocationFieldsKind }) {
  const t = useT()
  return (
    <div className="loc-fields loc-fields--panel" role="group" aria-label={t('cafe.locations.fields')} data-location-preview={`${kind}-panel`}>
      {FIELDS[kind].map((key) => <NotRecordedSelect key={key} label={t(key)} />)}
      {kind === 'receive' && <p className="loc-fields__note">{t('cafe.locations.receive.default')}</p>}
      <p className="loc-fields__note">{t('cafe.locations.notConnected')} <ManageLink /></p>
    </div>
  )
}

/** A line's own storage (Waste, Count): one select inside the line's detail, shown once the line has an amount. */
export function LocationLineField({ kind }: { kind: 'waste' | 'count' }) {
  const on = useLocationsPreview()
  const t = useT()
  if (!on) return null
  return <div className="loc-fields loc-fields--line" data-location-preview={`${kind}-line`}><NotRecordedSelect label={t('cafe.locations.field.storage')} /></div>
}

/** Receive: the optional override of the delivery's one "Store in", inside the line's detail; closed until asked for. */
export function LocationLineOverride() {
  const on = useLocationsPreview()
  const t = useT()
  if (!on) return null
  return (
    <details className="loc-fields loc-fields--override" data-location-preview="receive-line">
      <summary>{t('cafe.locations.lineOverride')}</summary>
      <NotRecordedSelect label={t('cafe.locations.field.storeIn')} />
    </details>
  )
}

/** Records: the optional Location filter (All / Unassigned / exact), disabled while nothing is recorded. */
export function LocationRecordsFilter() {
  const on = useLocationsPreview()
  const t = useT()
  if (!on) return null
  return (
    <div className="loc-fields loc-fields--inline" data-location-preview="records" title={t('cafe.locations.notConnected')}>
      <Select label={t('cafe.locations.records.filter')} value="all" disabled fullWidth>
        <option value="all">{t('cafe.locations.notConnectedShort')}</option>
      </Select>
    </div>
  )
}

/** Records line detail: Production location and From / To storage, "— · Not recorded" for every real record. */
const RECORD_LABEL: Record<RecordLocationKey, MessageKey> = {
  production: 'cafe.locations.field.production', storeOutput: 'cafe.locations.field.storeOutput', from: 'cafe.locations.field.from',
  to: 'cafe.locations.field.to', storage: 'cafe.locations.field.storage', storeIn: 'cafe.locations.field.storeIn',
}
export function LocationRecordFields({ keys }: { keys: readonly RecordLocationKey[] }) {
  const on = useLocationsPreview()
  const t = useT()
  if (!on) return null
  return <>{keys.map((key) => <div key={key} className="rec-fields__row" data-location-preview={`record-${key}`}><dt>{t(RECORD_LABEL[key])}</dt><dd>{t('cafe.locations.notRecordedValue')}</dd></div>)}</>
}

/** Available to transfer: the Location selector, the honest coverage line and the Change location door. The stream total stays primary and unsplit. */
export function LocationBalanceSection() {
  const on = useLocationsPreview()
  if (!on) return null
  return <BalanceSection />
}

function BalanceSection() {
  const t = useT()
  return (
    <section className="loc-fields loc-fields--balance" aria-labelledby="loc-balance-title" data-location-preview="balance">
      <h2 id="loc-balance-title" className="loc-fields__title">{t('cafe.locations.wip.title')}</h2>
      <div className="loc-fields__balance-row">
        <Select label={t('cafe.locations.wip.select')} value="all" disabled>
          <option value="all">{t('cafe.locations.wip.all')}</option>
        </Select>
        <Link className="btn btn-outline loc-fields__move" to={CHANGE_LOCATION_PATH} state={{ changeLocationFrom: 'stock' }}>{t('cafe.locations.move')}</Link>
      </div>
      <p className="loc-fields__note">{t('cafe.locations.wip.coverage')}</p>
    </section>
  )
}
