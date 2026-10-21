import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { getAttendanceSettings, saveAttendanceSettings, type AttendanceSettings } from '@/lib/db/attendance-clock'
import { listAttendanceSites, saveAttendanceSite, type AttendanceSite } from '@/lib/db/staff-attendance'
import './admin-attendance-page.css'

type Load = 'loading' | 'ready' | 'error'

// The remaining defaults are shown, not edited: the owner adjusts the late grace and each Site's radius.
const DEFAULT_ROWS: { key: keyof AttendanceSettings; label: MessageKey; unit: MessageKey | null }[] = [
  { key: 'leave_cutoff_days', label: 'attendance.settings.leaveCutoff', unit: 'attendance.settings.unitDays' },
  { key: 'clock_in_open_min', label: 'attendance.settings.clockInOpens', unit: 'attendance.settings.unitMinBefore' },
  { key: 'max_accuracy_m', label: 'attendance.settings.maxAccuracy', unit: null },
  { key: 'missing_alert_min', label: 'attendance.settings.missingAlert', unit: 'attendance.settings.unitMinAfter' },
  { key: 'uncovered_alert_min', label: 'attendance.settings.uncoveredAlert', unit: 'attendance.settings.unitMinBefore' },
  { key: 'no_clockout_close_min', label: 'attendance.settings.noClockOut', unit: 'attendance.settings.unitMinAfterEnd' },
  { key: 'selfie_retention_days', label: 'attendance.settings.selfieRetention', unit: 'attendance.settings.unitDays' },
]

export function AdminAttendanceSettingsPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('attendance.settings.title') }))
  const [state, setState] = useState<Load>('loading')
  const [settings, setSettings] = useState<AttendanceSettings | null>(null)
  const [sites, setSites] = useState<AttendanceSite[]>([])
  const [siteId, setSiteId] = useState('')
  const [graceText, setGraceText] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const [nextSettings, nextSites] = await Promise.all([getAttendanceSettings(), listAttendanceSites()])
      setSettings(nextSettings); setSites(nextSites); setGraceText(String(nextSettings.late_grace_min))
      setSiteId((current) => nextSites.some((row) => row.id === current) ? current : nextSites[0]?.id ?? '')
      setState('ready')
    } catch { setState('error') }
  }, [])
  useEffect(() => { void load() }, [load])

  const site = sites.find((row) => row.id === siteId) ?? null

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings) return
    const form = new FormData(event.currentTarget)
    const grace = Number(graceText)
    const latText = form.get('latitude')?.toString().trim() ?? ''
    const lngText = form.get('longitude')?.toString().trim() ?? ''
    const radius = Number(form.get('radius'))
    const latitude = latText === '' ? null : Number(latText)
    const longitude = lngText === '' ? null : Number(lngText)
    if (!Number.isInteger(grace) || grace < 0 || grace > 120) { setError(t('attendance.settings.graceInvalid')); return }
    if (site && ((latitude === null) !== (longitude === null) || (latitude !== null && (latitude < -90 || latitude > 90))
      || (longitude !== null && (longitude < -180 || longitude > 180)) || !Number.isInteger(radius) || radius < 1)) {
      setError(t('attendance.admin.siteInvalid')); return
    }
    setError(''); setMessage('')
    try {
      await saveAttendanceSettings({ ...settings, late_grace_min: grace })
      if (site) await saveAttendanceSite(site.id, latitude, longitude, radius)
      setSettings({ ...settings, late_grace_min: grace })
      if (site) setSites((rows) => rows.map((row) => row.id === site.id ? { ...row, latitude, longitude, attendance_radius_m: radius } : row))
      setMessage(t('attendance.settings.saved'))
    } catch { setError(t('attendance.admin.saveError')) }
  }

  return <PageFamilyFrame family="management" title={t('attendance.settings.title')} jobSentence={t('attendance.settings.job')} state={state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'default'}>
    <AdminSettingsNav />
    {state === 'loading' && <LoadingShell count={3} label={t('attendance.settings.loading')} />}
    {state === 'error' && <ErrorState message={t('attendance.settings.loadError')} onRetry={load} />}
    {state === 'ready' && settings && <form className="attendance-admin" noValidate onSubmit={(event) => void save(event)}>
      <section className="attendance-admin__panel" aria-labelledby="attendance-grace-heading">
        <h2 id="attendance-grace-heading">{t('attendance.settings.graceHeading')}</h2>
        <label className="attendance-admin__field">{t('attendance.settings.grace')}
          <span className="attendance-admin__input-unit"><input name="grace" type="number" min="0" max="120" step="1" required value={graceText} onChange={(event) => setGraceText(event.target.value)} /><span>{t('attendance.settings.unitMin')}</span></span>
        </label>
        <p className="attendance-admin__note">{t('attendance.settings.graceHelp', { minutes: String(settings.late_grace_min) })}</p>
        <p className="attendance-admin__note">{t('attendance.settings.nextShift')}</p>
      </section>
      <section className="attendance-admin__panel" aria-labelledby="attendance-site-heading">
        <h2 id="attendance-site-heading">{t('attendance.settings.siteHeading')}</h2>
        <Select id="attendance-settings-site" label={t('attendance.admin.site')} value={siteId} onChange={(event) => { setError(''); setMessage(''); setSiteId(event.target.value) }} fullWidth>
          {sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        {site && <div key={site.id} className="attendance-admin__form">
          <div className="attendance-admin__coordinate-grid">
            <label className="attendance-admin__field">{t('attendance.admin.latitude')}<input name="latitude" type="number" min="-90" max="90" step="any" defaultValue={site.latitude ?? ''} /></label>
            <label className="attendance-admin__field">{t('attendance.admin.longitude')}<input name="longitude" type="number" min="-180" max="180" step="any" defaultValue={site.longitude ?? ''} /></label>
          </div>
          <label className="attendance-admin__field">{t('attendance.admin.radius')}
            <span className="attendance-admin__input-unit"><input name="radius" type="number" min="1" step="1" required defaultValue={site.attendance_radius_m} /><span>m</span></span>
          </label>
          <p className="attendance-admin__note">{site.latitude === null ? t('attendance.settings.noPin') : t('attendance.admin.pinNote')}</p>
        </div>}
      </section>
      <details className="attendance-admin__panel">
        <summary>{t('attendance.settings.otherDefaults')}</summary>
        <dl className="attendance-admin__defaults">
          {DEFAULT_ROWS.map((row) => <div key={row.key}><dt>{t(row.label)}</dt><dd>{settings[row.key]} {row.unit ? t(row.unit) : 'm'}</dd></div>)}
        </dl>
      </details>
      {error && <p className="attendance-admin__message attendance-admin__message--error" role="alert">{error}</p>}
      {message && <p className="attendance-admin__message" role="status">{message}</p>}
      <div className="attendance-admin__actions"><button type="submit" className="attendance-admin__primary">{t('attendance.settings.save')}</button></div>
    </form>}
  </PageFamilyFrame>
}
