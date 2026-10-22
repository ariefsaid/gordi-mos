import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useT } from '@/i18n/use-t'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Select } from '@/components/ui/select'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import {
  archiveSiteShiftTemplate, listAttendanceSites, listStaffSiteTemplates, saveAttendanceSite,
  saveSiteShiftTemplate, type AttendanceSite, type ShiftTemplate,
} from '@/lib/db/staff-attendance'
import './admin-attendance-page.css'

type LoadState = 'loading' | 'ready' | 'error'

export function AdminAttendancePage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('attendance.admin.title') }))
  const [state, setState] = useState<LoadState>('loading')
  const [sites, setSites] = useState<AttendanceSite[]>([])
  const [siteId, setSiteId] = useState('')
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [templateFilter, setTemplateFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templatesFailed, setTemplatesFailed] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('07:00')
  const [end, setEnd] = useState('15:00')
  const [editing, setEditing] = useState<string | null>(null)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const templateRequest = useRef(0)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const data = await listAttendanceSites()
      setSites(data)
      setSiteId((current) => data.some((row) => row.id === current) ? current : data[0]?.id ?? '')
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  const loadTemplates = useCallback(async (id: string) => {
    const request = ++templateRequest.current
    setTemplates([])
    setTemplatesFailed(false)
    setLoadingTemplates(Boolean(id))
    if (!id) return
    try {
      const rows = await listStaffSiteTemplates(id)
      if (request === templateRequest.current) setTemplates(rows)
    } catch {
      if (request === templateRequest.current) setTemplatesFailed(true)
    } finally {
      if (request === templateRequest.current) setLoadingTemplates(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadTemplates(siteId) }, [loadTemplates, siteId])

  const site = sites.find((row) => row.id === siteId) ?? null
  const visibleTemplates = templates.filter((row) => templateFilter === 'all' || (templateFilter === 'archived' ? row.archived_at !== null : row.archived_at === null))

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!site) return
    const latText = new FormData(event.currentTarget).get('latitude')?.toString().trim() ?? ''
    const lngText = new FormData(event.currentTarget).get('longitude')?.toString().trim() ?? ''
    const radiusText = new FormData(event.currentTarget).get('radius')?.toString() ?? ''
    const latitude = latText === '' ? null : Number(latText)
    const longitude = lngText === '' ? null : Number(lngText)
    const radius = Number(radiusText)
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (latitude < -90 || latitude > 90))
      || (longitude !== null && (longitude < -180 || longitude > 180)) || !Number.isInteger(radius) || radius < 1) {
      setError(t('attendance.admin.siteInvalid'))
      return
    }
    setError(''); setMessage('')
    try {
      await saveAttendanceSite(site.id, latitude, longitude, radius)
      setSites((rows) => rows.map((row) => row.id === site.id ? { ...row, latitude, longitude, attendance_radius_m: radius } : row))
      setMessage(t('attendance.admin.siteSaved'))
    } catch {
      setError(t('attendance.admin.saveError'))
    }
  }

  function editTemplate(template: ShiftTemplate) {
    setShowTemplateForm(true)
    setEditing(template.id)
    setName(template.name)
    setStart(template.start_time.slice(0, 5))
    setEnd(template.end_time.slice(0, 5))
  }

  function clearTemplateForm() {
    setShowTemplateForm(false); setEditing(null); setName(''); setStart('07:00'); setEnd('15:00')
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!site) return
    if (!name.trim() || !start || !end || start === end) { setError(t('attendance.admin.templateInvalid')); return }
    setError(''); setMessage('')
    try {
      await saveSiteShiftTemplate(site.id, editing, name.trim(), start, end)
      clearTemplateForm()
      await loadTemplates(site.id)
      setMessage(t('attendance.admin.templateSaved'))
    } catch {
      setError(t('attendance.admin.saveError'))
    }
  }

  async function archiveTemplate(template: ShiftTemplate) {
    if (!window.confirm(t('attendance.admin.archiveConfirm', { name: template.name }))) return
    setError(''); setMessage('')
    try {
      await archiveSiteShiftTemplate(template.id)
      await loadTemplates(siteId)
      setMessage(t('attendance.admin.archived'))
    } catch {
      setError(t('attendance.admin.saveError'))
    }
  }

  return (
    <PageFamilyFrame family="management" title={t('attendance.admin.title')} jobSentence={t('attendance.admin.job')} state={state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'default'}>
      <AdminSettingsNav />
      {state === 'loading' && <LoadingShell count={4} label={t('attendance.admin.loading')} />}
      {state === 'error' && <ErrorState message={t('attendance.admin.loadError')} onRetry={load} />}
      {state === 'ready' && <div className="attendance-admin">
        <section className="attendance-admin__panel" aria-labelledby="attendance-templates-heading">
          <h2 id="attendance-templates-heading">{t('attendance.admin.shiftBuilder')}</h2>
          <div className="attendance-admin__builder-toolbar">
            <Select id="attendance-site" label={t('attendance.admin.site')} value={siteId} onChange={(event) => { setError(''); setMessage(''); clearTemplateForm(); setSiteId(event.target.value) }} fullWidth>
              {sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <Select className="attendance-admin__filter" label={t('attendance.admin.shiftStatus')} value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value as 'active' | 'archived' | 'all')} fullWidth><option value="active">{t('attendance.admin.activeShifts')}</option><option value="archived">{t('attendance.admin.archivedShifts')}</option><option value="all">{t('attendance.admin.allShifts')}</option></Select>
          </div>
          <p className="attendance-admin__note">{t('attendance.admin.shiftHelp', { site: site?.name ?? '' })}</p>
          {!site && <p>{t('attendance.admin.noSites')}</p>}
          {site && (templatesFailed ? <div className="attendance-admin__template-error"><p role="alert">{t('attendance.admin.loadError')}</p><button type="button" onClick={() => void loadTemplates(siteId)}>{t('common.retry')}</button></div> : loadingTemplates ? <p role="status">{t('attendance.admin.loading')}</p> : visibleTemplates.length === 0 ? <p>{t(templateFilter === 'archived' ? 'attendance.admin.noArchived' : 'attendance.admin.noShifts')}</p> : <ul className="attendance-admin__template-list">
            {visibleTemplates.map((template) => <li key={template.id}><span><strong>{template.name}</strong>{template.archived_at && <small>{t('attendance.admin.archivedStatus')}</small>}<small>{template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}{template.end_time < template.start_time ? ` · ${t('attendance.admin.nextDay')}` : ''}</small></span>{template.archived_at === null && <span className="attendance-admin__actions"><button type="button" onClick={() => editTemplate(template)}>{t('attendance.admin.edit')}</button><button type="button" className="attendance-admin__quiet" onClick={() => void archiveTemplate(template)}>{t('attendance.admin.archive')}</button></span>}</li>)}
          </ul>)}
          {showTemplateForm ? <form onSubmit={(event) => void submitTemplate(event)} className="attendance-admin__template-form">
            <label className="attendance-admin__field">{t('attendance.admin.shiftName')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>
            <div className="attendance-admin__coordinate-grid">
              <label className="attendance-admin__field">{t('attendance.admin.start')}<input type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
              <label className="attendance-admin__field">{t('attendance.admin.end')}<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /><span className="attendance-admin__note">{end < start ? t('attendance.admin.nextDay') : t('attendance.admin.sameDay')}</span></label>
            </div>
            <div className="attendance-admin__actions"><button type="submit" className="attendance-admin__primary" disabled={!site}>{t(editing ? 'common.save' : 'attendance.admin.addShift')}</button><button type="button" onClick={clearTemplateForm}>{t('common.cancel')}</button></div>
          </form> : <button type="button" className="attendance-admin__primary" disabled={!site} onClick={() => setShowTemplateForm(true)}>{t('attendance.admin.addShift')}</button>}
          <p className="attendance-admin__note">{t('attendance.admin.snapshotNote')}</p>
        </section>

        <section className="attendance-admin__panel" aria-label={t('attendance.admin.siteSettings')}>
          <details className="attendance-admin__location">
            <summary>{t('attendance.admin.siteSettings')}</summary>
            {site && <form key={site.id} onSubmit={(event) => void saveSite(event)} className="attendance-admin__form">
              <div className="attendance-admin__coordinate-grid">
                <label className="attendance-admin__field">{t('attendance.admin.latitude')}<input name="latitude" aria-label={t('attendance.admin.latitude')} type="number" min="-90" max="90" step="any" defaultValue={site.latitude ?? ''} /></label>
                <label className="attendance-admin__field">{t('attendance.admin.longitude')}<input name="longitude" aria-label={t('attendance.admin.longitude')} type="number" min="-180" max="180" step="any" defaultValue={site.longitude ?? ''} /></label>
              </div>
              <label className="attendance-admin__field">{t('attendance.admin.radius')}<span className="attendance-admin__input-unit"><input name="radius" aria-label={t('attendance.admin.radius')} type="number" min="1" step="1" required defaultValue={site.attendance_radius_m} /><span>m</span></span></label>
              <p className="attendance-admin__note">{t('attendance.admin.pinNote')}</p>
              <button type="submit" className="attendance-admin__primary">{t('common.save')}</button>
            </form>}
          </details>
        </section>
        {error && <p className="attendance-admin__message attendance-admin__message--error" role="alert">{error}</p>}
        {message && <p className="attendance-admin__message" role="status">{message}</p>}
      </div>}
    </PageFamilyFrame>
  )
}
