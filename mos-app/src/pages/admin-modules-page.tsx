import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { FilterChip } from '@/components/ui/filter-chip'
import { Notice } from '@/components/ui/notice'
import { Pill } from '@/components/ui/pill'
import { SearchField } from '@/components/ui/search-field'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { ContractError } from '@/lib/db/contract'
import { defaultModuleEnabled } from '@/lib/module-defaults'
import {
  listOrgModuleSettings,
  saveOrgModuleSettings,
  type ModuleId,
  type ModuleSettingInput,
  type OrgModuleSetting,
} from '@/lib/db/module-settings'
import { loadModuleAvailability } from '@/lib/module-availability'
import { moduleFacts, peopleWithOverridesPath, type ModuleFact } from '@/lib/module-switches-preview'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import './admin-modules-page.css'

type LoadStatus = 'loading' | 'ready' | 'error'

function isConflict(error: unknown): boolean {
  if (error instanceof ContractError) return error.code === 'CONFLICT'
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '40001'
}

export function AdminModulesPage() {
  const t = useT()
  useDocumentTitle(t('common.docTitle', { page: t('admin.modules.title') }))
  const isDesktop = useIsDesktop()
  const offline = useIsOffline()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [rows, setRows] = useState<OrgModuleSetting[]>([])
  const [draft, setDraft] = useState<Partial<Record<ModuleId, boolean>>>({})
  const [saving, setSaving] = useState(false)
  const clientRequestId = useRef<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const facts = moduleFacts()

  const reload = useCallback(async () => {
    clientRequestId.current = null
    setStatus('loading')
    setConflict(false)
    setSaveError(false)
    try {
      setRows(await listOrgModuleSettings())
      setDraft({})
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Links from before Modules had its own page land on that person.
  const legacyPerson = params.get('person')
  if (legacyPerson) return <Navigate to={`/admin/people/${encodeURIComponent(legacyPerson)}`} replace />

  const needle = q.trim().toLowerCase()
  const visibleFacts = facts.filter((fact) => !needle || t(fact.labelKey).toLowerCase().includes(needle))
  const setQuery = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('q', value); else next.delete('q')
    setParams(next, { replace: true })
  }
  const settings = new Map(rows.map((row) => [row.module_id, row]))
  const enabledFor = (fact: ModuleFact) => fact.released && (draft[fact.id] ?? settings.get(fact.id)?.enabled ?? defaultModuleEnabled(fact.id))
  const changedRows: ModuleSettingInput[] = facts.flatMap((fact) => {
    const setting = settings.get(fact.id)
    const enabled = enabledFor(fact)
    if (!fact.released || enabled === (setting?.enabled ?? defaultModuleEnabled(fact.id))) return []
    return [{ module_id: fact.id, enabled, expected_version: setting?.row_version ?? 0 }]
  })

  const save = async () => {
    if (!changedRows.length || saving) return
    setSaving(true)
    setConflict(false)
    setSaveError(false)
    const requestId = clientRequestId.current ?? crypto.randomUUID()
    clientRequestId.current = requestId
    try {
      const saved = await saveOrgModuleSettings(changedRows, { client_request_id: requestId })
      clientRequestId.current = null
      setRows(saved)
      setDraft({})
      setStatus('ready')
      void loadModuleAvailability({ force: true })
    } catch (error) {
      if (isConflict(error)) setConflict(true)
      else setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  const setOrgEnabled = (moduleId: ModuleId, enabled: boolean) => {
    clientRequestId.current = null
    setSaveError(false)
    setDraft((current) => ({ ...current, [moduleId]: enabled }))
  }

  const orgColumns: DataTableColumn<ModuleFact & { id: string }>[] = [
    { key: 'module', header: t('admin.modules.col.module'), sortState: 'asc', render: (fact) => <strong className="modules__name">{t(fact.labelKey)}</strong> },
    { key: 'release', header: t('admin.modules.col.release'), render: (fact) => <ReleasePill fact={fact} /> },
    { key: 'availability', header: t('admin.modules.col.availability'), render: (fact) => <OrgState fact={fact} enabled={enabledFor(fact)} /> },
    { key: 'overrides', header: t('admin.modules.col.overrides'), render: (fact) => <OverridesLink fact={fact} /> },
    { key: 'actions', header: t('admin.modules.col.actions'), render: (fact) => <OrgControl fact={fact} enabled={enabledFor(fact)} disabled={saving || !fact.released} setEnabled={(enabled) => setOrgEnabled(fact.id, enabled)} /> },
  ]

  return (
    <PageFamilyFrame family="management" title={t('admin.modules.title')} jobSentence={t('admin.modules.job')}>
      <AdminSettingsNav />
      <div className="modules">
        <div className="modules__scope">
          <span className="modules__scope-label">{t('admin.modules.scope')}</span>
          <span className="modules__scope-value">{t('admin.modules.scope.org')}</span>
        </div>
        {offline && <Notice tone="attention">{t('common.offline.reconnect')}</Notice>}
        {status === 'loading' ? <LoadingShell /> : status === 'error' ? (
          <ErrorState message={t('admin.modules.loadError')} onRetry={() => void reload()} />
        ) : (
          <>
            {conflict && <Notice tone="attention" role="alert" action={<Button variant="outline" onClick={() => void reload()}>{t('admin.modules.reload')}</Button>}>{t('admin.modules.conflict')}</Notice>}
            {saveError && <ErrorState message={t('admin.modules.saveError')} onRetry={() => void save()} />}
            <div className="modules__toolbar">
              <SearchField
                label={t('admin.modules.searchModules')}
                placeholder={t('admin.modules.searchModulesHint')}
                value={q}
                onChange={setQuery}
              />
              <span className="modules__count tabular" role="status">{t(visibleFacts.length === 1 ? 'admin.modules.count.one' : 'admin.modules.count.other', { count: visibleFacts.length })}</span>
            </div>
            {q && (
              <div className="modules__chips">
                <FilterChip label={`${t('admin.modules.searchModules')}: ${q}`} onRemove={() => setQuery('')} />
              </div>
            )}
            {visibleFacts.length === 0 ? (
              <EmptyState variant="blank" title={t('admin.modules.noMatchModules')}><Button onClick={() => setQuery('')}>{t('common.clearFilters')}</Button></EmptyState>
            ) : (
              <>
                <div className="record-collection-view">
                  <DataTable<ModuleFact & { id: string }>
                    columns={orgColumns}
                    rows={visibleFacts.map((fact) => ({ ...fact }))}
                    isDesktop={isDesktop}
                    caption={t('admin.modules.orgTable')}
                    tableClassName="record-collection-table collection-grammar-table modules__table"
                    renderCard={(fact) => (
                      <div className="modules__card">
                        <div className="modules__card-head"><strong className="modules__name">{t(fact.labelKey)}</strong><ReleasePill fact={fact} /></div>
                        <OrgState fact={fact} enabled={enabledFor(fact)} />
                        <OrgControl fact={fact} enabled={enabledFor(fact)} disabled={saving || !fact.released} setEnabled={(enabled) => setOrgEnabled(fact.id, enabled)} />
                        <div className="modules__card-overrides">
                          <span className="modules__muted">{t('admin.modules.col.overrides')}</span>
                          <OverridesLink fact={fact} />
                        </div>
                      </div>
                    )}
                  />
                </div>
                <ActionBar
                  className="modules__actions"
                  reason={changedRows.length === 0 ? t('admin.modules.noChanges') : undefined}
                  primary={<Button variant="primary" disabled={saving || changedRows.length === 0} onClick={() => void save()}>{t('admin.modules.saveOrg')}</Button>}
                  aria-label={t('admin.modules.saveOrg')}
                />
              </>
            )}
          </>
        )}
      </div>
    </PageFamilyFrame>
  )
}

function ReleasePill({ fact }: { fact: ModuleFact }) {
  const t = useT()
  return fact.released ? <Pill tone="success">{t('admin.modules.released')}</Pill> : <Pill tone="neutral">{t('admin.modules.notReleased')}</Pill>
}

function OrgState({ fact, enabled }: { fact: ModuleFact; enabled: boolean }) {
  const t = useT()
  if (!fact.released) return <span className="modules__muted">{t('admin.modules.cannotEnable')}</span>
  return <span>{t(enabled ? 'admin.modules.on' : 'admin.modules.off')}</span>
}

function OverridesLink({ fact }: { fact: ModuleFact }) {
  const t = useT()
  if (!fact.released) {
    return <span className="modules__muted"><span aria-hidden="true">—</span><span className="sr-only">{t('admin.modules.notReleased')}</span></span>
  }
  const module = t(fact.labelKey)
  return (
    <Link className="modules__open" to={peopleWithOverridesPath(fact.id)}>
      <span className="tabular">—</span>
      <span className="modules__open-hint">{t('admin.modules.viewPeople')}</span>
      <span className="sr-only">{t('admin.modules.overridesUnknown', { module })}</span>
    </Link>
  )
}

function OrgControl({ fact, enabled, disabled, setEnabled }: {
  fact: ModuleFact
  enabled: boolean
  disabled: boolean
  setEnabled: (enabled: boolean) => void
}) {
  const t = useT()
  const label = t('admin.modules.availabilityOf', { module: t(fact.labelKey) })
  return (
    <div className="modules__cell">
      <Select
        aria-label={label}
        value={enabled ? 'on' : 'off'}
        disabled={disabled}
        fullWidth
        onChange={(event) => setEnabled(event.target.value === 'on')}
      >
        <option value="on">{t('admin.modules.on')}</option>
        <option value="off">{t('admin.modules.off')}</option>
      </Select>
      {fact.released && !enabled && <span className="modules__muted">{t('admin.modules.offConsequence')}</span>}
    </div>
  )
}
