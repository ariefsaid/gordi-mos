import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActionBar } from '@/components/ui/action-bar'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { Notice } from '@/components/ui/notice'
import { Select } from '@/components/ui/select'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import type { AdminPersonRow } from '@/lib/db/admin-users.types'
import {
  listPersonModuleSettings,
  savePersonModuleSettings,
  type ModuleId,
  type PersonModuleOverride,
  type PersonModuleSetting,
} from '@/lib/db/module-settings'
import { ContractError } from '@/lib/db/contract'
import { effectiveModuleAccess } from '@/lib/module-access'
import { loadModuleAvailability } from '@/lib/module-availability'
import { moduleFacts, roleAdmittedTo } from '@/lib/module-switches-preview'
import { useIsOffline } from '@/shell/use-is-offline'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import './person-modules-card.css'

type SettingsState = 'loading' | 'error' | 'ready'
const MODULE_IDS: readonly ModuleId[] = ['work', 'money', 'cafe', 'staff', 'assistant', 'roastery', 'ecommerce']
const REASON_KEY: Record<'available' | 'notReleased' | 'orgOff' | 'blocked' | 'accessRequired', MessageKey> = {
  available: 'admin.modules.reason.available',
  notReleased: 'admin.modules.notReleased',
  orgOff: 'admin.modules.reason.orgOff',
  blocked: 'admin.modules.reason.blocked',
  accessRequired: 'admin.modules.reason.accessRequired',
}

function isValidSettings(rows: readonly PersonModuleSetting[], personId: string): boolean {
  return rows.length === MODULE_IDS.length && new Set(rows.map((row) => row.module_id)).size === MODULE_IDS.length &&
    MODULE_IDS.every((moduleId) => rows.some((row) => row.module_id === moduleId &&
      row.person_id === personId && (row.override === 'inherit' || row.override === 'allow' || row.override === 'block') &&
      Number.isSafeInteger(row.row_version) && row.row_version >= 0 && typeof row.org_enabled === 'boolean'))
}

export function PersonModulesCard({ person }: { person: AdminPersonRow }) {
  const t = useT()
  const offline = useIsOffline()
  const facts = useMemo(() => moduleFacts(), [])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [state, setState] = useState<SettingsState>('loading')
  const [savedRows, setSavedRows] = useState<PersonModuleSetting[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Record<ModuleId, PersonModuleOverride>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoadedFor(person.id)
    setState('loading')
    try {
      const rows = await listPersonModuleSettings(person.id)
      if (sequence !== loadSequence.current) return
      if (!isValidSettings(rows, person.id)) throw new Error('Invalid person module settings response')
      setSavedRows(rows)
      setLoadedFor(person.id)
      setState('ready')
    } catch {
      if (sequence !== loadSequence.current) return
      setState('error')
    }
  }, [person.id])

  useEffect(() => {
    setEditing(false)
    setDraft({})
    setSaving(false)
    setSaveError(false)
    setConflict(false)
    setJustSaved(false)
    setRequestId(null)
    void load()
    return () => { loadSequence.current += 1 }
  }, [load, person.id])

  const savedByModule = useMemo(() => new Map(savedRows.map((row) => [row.module_id, row])), [savedRows])
  const changedRows = savedRows.flatMap((row) => {
    const override = draft[row.module_id] ?? row.override
    return override === row.override ? [] : [{ module_id: row.module_id, override, expected_version: row.row_version }]
  })
  const dirty = changedRows.length > 0

  function beginEditing() {
    setDraft(Object.fromEntries(savedRows.map((row) => [row.module_id, row.override])))
    setEditing(true)
    setJustSaved(false)
    setSaveError(false)
    setConflict(false)
    setRequestId(null)
  }

  function changeOverride(moduleId: ModuleId, override: PersonModuleOverride) {
    setDraft((current) => ({ ...current, [moduleId]: override }))
    setRequestId(null)
    setJustSaved(false)
    setSaveError(false)
    setConflict(false)
  }

  function cancelEditing() {
    setEditing(false)
    setDraft({})
    setRequestId(null)
    setSaveError(false)
    setConflict(false)
  }

  async function save() {
    if (!dirty || offline || saving || conflict) return
    const sequence = loadSequence.current
    const clientRequestId = requestId ?? crypto.randomUUID()
    setRequestId(clientRequestId)
    setSaving(true)
    setSaveError(false)
    setConflict(false)
    try {
      const rows = await savePersonModuleSettings(person.id, changedRows, { client_request_id: clientRequestId })
      if (sequence !== loadSequence.current) return
      if (!isValidSettings(rows, person.id)) throw new Error('Invalid person module save response')
      setSavedRows(rows)
      setDraft({})
      setEditing(false)
      setRequestId(null)
      setJustSaved(true)
      void loadModuleAvailability({ force: true })
    } catch (error) {
      if (sequence !== loadSequence.current) return
      if (error instanceof ContractError && error.code === 'CONFLICT') setConflict(true)
      else setSaveError(true)
    } finally {
      if (sequence === loadSequence.current) setSaving(false)
    }
  }

  if (loadedFor !== person.id || state === 'loading') {
    return <section className="person-card person-modules" aria-label={t('admin.modules.title')}><LoadingShell count={3} /></section>
  }
  if (state === 'error') {
    return (
      <section className="person-card person-modules" aria-label={t('admin.modules.title')}>
        <div className="person-card__head"><h2 className="person-card__title">{t('admin.modules.title')}</h2></div>
        <ErrorState message={t('admin.modules.loadError')} onRetry={() => void load()} />
      </section>
    )
  }

  const title = t('admin.modules.title')
  return (
    <section className="person-card person-modules" aria-label={title}>
      <div className="person-card__head">
        <h2 className="person-card__title">{title}</h2>
        {!editing && <Button variant="outline" className="person-card__change" disabled={offline} onClick={beginEditing}>{t('admin.person.change')}</Button>}
      </div>
      {conflict && <ErrorState message={t('admin.modules.conflict')} onRetry={() => { cancelEditing(); void load() }} retryLabel={t('admin.modules.reload')} />}
      {saveError && <ErrorState message={t('admin.modules.saveError')} />}
      {justSaved && <Notice tone="success">{t('admin.modules.person.saved')}</Notice>}
      {editing && savedRows.some((row) => !row.org_enabled) && (
        <Notice tone="attention" role="none">{t('admin.modules.person.orgOffWins')}</Notice>
      )}
      <ul className="person-card__list">
        {facts.map((fact) => {
          const row = savedByModule.get(fact.id)
          if (!row) return null
          const override = editing ? (draft[fact.id] ?? row.override) : row.override
          const result = effectiveModuleAccess({
            released: fact.released,
            orgEnabled: row.org_enabled,
            override,
            roleAdmitted: roleAdmittedTo(fact.id, person.access_roles),
          })
          return (
            <li key={fact.id} className="person-card__item person-modules__row">
              <span className="person-card__item-text">
                <span className="person-card__name">{t(fact.labelKey)}</span>
                <span className={`person-card__meta${result.available ? ' person-modules__on' : ''}`}>
                  {t(`admin.modules.${override}` as MessageKey)} · {t(REASON_KEY[result.reason])}
                </span>
              </span>
              {editing && fact.released && (
                <div className="person-modules__select">
                  <Select
                    aria-label={t('admin.modules.overrideOf', { module: t(fact.labelKey) })}
                    value={override}
                    fullWidth
                    disabled={offline || saving || conflict}
                    onChange={(event) => changeOverride(fact.id, event.target.value as PersonModuleOverride)}
                  >
                    <option value="inherit">{t('admin.modules.inherit')}</option>
                    <option value="allow">{t('admin.modules.allow')}</option>
                    <option value="block">{t('admin.modules.block')}</option>
                  </Select>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="person-card__meaning">{t('admin.modules.person.meaning')}</p>
      <Link className="person-card__link person-modules__org-link" to="/admin/modules">{t('admin.modules.person.orgLink')}</Link>
      {editing && (
        <>
          <RouteLeaveGuard when={dirty} includeSearch message={t('admin.modules.person.leaveMessage')} />
          <ActionBar
            className="person-modules__actions"
            secondary={<Button variant="outline" disabled={saving} onClick={cancelEditing}>{t('common.cancel')}</Button>}
            primary={<Button variant="primary" disabled={!dirty || offline || saving || conflict} onClick={() => void save()}>{saving ? t('common.saving') : t('admin.modules.savePerson')}</Button>}
          />
        </>
      )}
    </section>
  )
}
