import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RouteLeaveGuard } from '@/shell/route-leave-guard'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsOffline } from '@/shell/use-is-offline'
import { OfflineNotice } from '@/components/ui/offline-notice'
import { Notice } from '@/components/ui/notice'
import { formatWibDateTime } from '@/lib/format/date'
import { useT } from '@/i18n/use-t'
import { UserFacingError } from '@/lib/save-error'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TextInput } from '@/components/ui/text-input'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { StatusBadge } from '@/components/ui/status-badge'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
import { AgentRegistry } from '@/components/admin/agent-registry'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import {
  addTrustedAgentClient,
  listAdminAgentConnections,
  revokeAdminAgentConnection,
  setTrustedAgentEnabled,
  type AdminAgentConnectionRow,
} from '@/lib/db/agent-connections'
import './admin-agent-connections-page.css'

type LoadState = 'loading' | 'loaded' | 'error'
type PendingAction =
  | { kind: 'revoke'; appName: string; personName: string; personId: string; clientId: string }
  | { kind: 'distrust'; appName: string; clientId: string }
type ActionNotice = { role: 'alert' | 'status'; message: string }

export interface AppView {
  clientId: string
  displayName: string
  enabled: boolean
  connections: AdminAgentConnectionRow[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function appViews(rows: AdminAgentConnectionRow[]): AppView[] {
  const apps = new Map<string, AppView>()
  for (const row of rows) {
    let app = apps.get(row.client_id)
    if (!app) {
      app = { clientId: row.client_id, displayName: row.display_name, enabled: row.enabled, connections: [] }
      apps.set(row.client_id, app)
    }
    if (row.person_id && row.person_name) app.connections.push(row)
  }
  return [...apps.values()]
}

export function AdminAgentConnectionsPage() {
  const t = useT()
  const { locale } = useI18n()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [rows, setRows] = useState<AdminAgentConnectionRow[]>([])
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [clientId, setClientId] = useState('')
  const [displayName, setDisplayName] = useState('')
  // The problem names its field: the message sits under that field and only that field is marked.
  const [formError, setFormErrorState] = useState<{ field: 'id' | 'name' | 'form'; message: string } | null>(null)
  const setFormError = (message: string, field: 'id' | 'name' | 'form' = 'form') => setFormErrorState(message ? { field, message } : null)
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null)
  const [adding, setAdding] = useState(false)
  const [changingClientId, setChangingClientId] = useState<string | null>(null)
  // The open app and the register form live in the URL (NV4). On desktop the first app is open by
  // default; on a phone the list comes first and an app opens on a tap.
  const [params, setParams] = useSearchParams()
  const apps = useMemo(() => appViews(rows), [rows])
  const isDesktopWidth = useIsDesktop()
  const addingMode = params.get('add') === '1'
  const requestedApp = params.get('app')
  const selectedApp = apps.find((app) => app.clientId === requestedApp) ?? (isDesktopWidth && !addingMode ? apps[0] ?? null : null)
  const setParam = useCallback((key: string, value: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    if (value) next.set(key, value); else next.delete(key)
    return next
  }), [setParams])
  const setAddingMode = (on: boolean) => setParam('add', on ? '1' : null)
  const setSelectedClientId = (id: string | null) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    next.delete('add')
    if (id) next.set('app', id); else next.delete('app')
    return next
  })
  const isDesktop = isDesktopWidth
  const offline = useIsOffline()

  useDocumentTitle(t('common.docTitle', { page: t('agentConnections.admin.title') }))

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const nextRows = await listAdminAgentConnections()
      setRows(nextRows)
      setLoadState('loaded')
    } catch {
      setLoadState('error')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedId = clientId.trim().toLowerCase()
    const normalizedName = displayName.trim()
    if (!UUID_PATTERN.test(normalizedId)) {
      setFormError(t('agentConnections.admin.invalidClientId'), 'id')
      return
    }
    if (!normalizedName) {
      setFormError(t('agentConnections.admin.requiredName'), 'name')
      return
    }
    setFormError('')
    setAdding(true)
    try {
      await addTrustedAgentClient({ client_id: normalizedId, display_name: normalizedName })
      setClientId('')
      setDisplayName('')
      setAddingMode(false)
      await load()
    } catch {
      setFormError(t('agentConnections.admin.addError'), 'form')
    } finally {
      setAdding(false)
    }
  }

  async function handleToggle(app: AppView) {
    setActionNotice(null)
    if (app.enabled) {
      setPending({ kind: 'distrust', appName: app.displayName, clientId: app.clientId })
      return
    }
    setChangingClientId(app.clientId)
    try {
      await setTrustedAgentEnabled(app.clientId, true)
      await load()
    } catch {
      setActionNotice({ role: 'alert', message: t('agentConnections.admin.actionError') })
    } finally {
      setChangingClientId(null)
    }
  }

  async function handleConfirm() {
    if (!pending) return
    setActionNotice(null)
    try {
      if (pending.kind === 'distrust') {
        await setTrustedAgentEnabled(pending.clientId, false)
      } else {
        const revoked = await revokeAdminAgentConnection(pending.personId, pending.clientId)
        if (!revoked) {
          setPending(null)
          await load()
          setActionNotice({ role: 'status', message: t('agentConnections.admin.connectionNotActive') })
          return
        }
      }
    } catch {
      throw new UserFacingError(t('agentConnections.admin.actionError'))
    }
    setPending(null)
    await load()
  }

  // The page's one primary: Add trusted agent (top right; phone: bottom bar). While the register form is
  // open the form's own submit is the primary — inline on desktop, in the phone bar.
  const formDirty = addingMode && (clientId !== '' || displayName !== '')
  const submitButton = <Button variant="primary" type="submit" form="agent-add-form" disabled={adding || offline}>
    {adding ? t('agentConnections.admin.adding') : t('agentConnections.admin.add')}
  </Button>
  const addButton = <Button variant="primary" onClick={() => setAddingMode(true)}>{t('agentConnections.admin.add')}</Button>
  const primaryAction = loadState !== 'loaded' ? undefined : addingMode ? (isDesktop ? undefined : submitButton) : addButton
  const primaryReason = addingMode && offline ? <span role="status">{t('common.offline.reconnect')}</span> : undefined
  const frameState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'default'
  return (
    <PageFamilyFrame
      family="management"
      title={t('agentConnections.admin.title')}
      jobSentence={t('agentConnections.admin.job')}
      action={primaryAction}
      actionReason={primaryAction ? primaryReason : undefined}
      state={frameState}
    >
      <AdminSettingsNav />
      <OfflineNotice />
      <RouteLeaveGuard when={formDirty && !adding} includeSearch message={t('agentConnections.admin.leaveMessage')} />
      <div className="agent-connections-admin">
        {actionNotice && (
          <Notice tone={actionNotice.role === 'status' ? 'success' : 'urgent'} role={actionNotice.role}>
            {actionNotice.message}
          </Notice>
        )}

        {addingMode && <section className="agent-connections-admin__add-workspace" aria-labelledby="agent-connections-add-title">
          <div className="agent-connections-admin__workspace-head">
            <h2 id="agent-connections-add-title">{t('agentConnections.admin.addTitle')}</h2>
            <Button variant="outline" disabled={adding} onClick={() => { setAddingMode(false); setFormError('') }}>{t('common.cancel')}</Button>
          </div>
          <p className="agent-connections-admin__add-copy">{t('agentConnections.admin.addCopy')}</p>
          <form id="agent-add-form" className="agent-connections-admin__form" onSubmit={(event) => void handleAdd(event)}
            onKeyDown={(event) => { if (event.key === 'Escape' && !adding) { setAddingMode(false); setFormError('') } }} noValidate>
            <TextInput
              id="agent-client-id"
              label={t('agentConnections.admin.clientId')}
              requiredMark
              aria-required="true"
              value={clientId}
              onChange={(event) => { setClientId(event.target.value); setFormError('') }}
              autoComplete="off"
              spellCheck={false}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              error={formError?.field === 'id'}
              aria-describedby={formError?.field === 'id' ? 'agent-add-error' : 'agent-client-id-help'}
              disabled={adding}
            />
            {formError?.field === 'id'
              ? <p id="agent-add-error" className="agent-connections-admin__error agent-connections-admin__field-help" role="alert">{formError.message}</p>
              : <p id="agent-client-id-help" className="agent-connections-admin__field-help">{t('agentConnections.admin.clientIdHelp')}</p>}
            <TextInput
              id="agent-display-name"
              label={t('agentConnections.admin.displayName')}
              requiredMark
              aria-required="true"
              value={displayName}
              onChange={(event) => { setDisplayName(event.target.value); setFormError('') }}
              autoComplete="off"
              maxLength={100}
              error={formError?.field === 'name'}
              aria-describedby={formError?.field === 'name' ? 'agent-name-error' : undefined}
              disabled={adding}
            />
            {formError && formError.field !== 'id' && <p id="agent-name-error" className="agent-connections-admin__error" role="alert">{formError.message}</p>}
            {isDesktop && <div className="agent-connections-admin__submit">{offline && <span className="admin-action__reason" role="status">{t('common.offline.reconnect')}</span>}{submitButton}</div>}
          </form>
        </section>}

        {loadState === 'loading' && <LoadingShell count={3} label={t('agentConnections.admin.loading')} />}
        {loadState === 'error' && (
          <ErrorState message={t('agentConnections.admin.loadError')} onRetry={() => void load()} />
        )}
        {loadState === 'loaded' && apps.length === 0 && (
          <EmptyState variant="blank" title={t('agentConnections.admin.emptyTitle')} copy={t('agentConnections.admin.emptyCopy')} />
        )}
        {loadState === 'loaded' && apps.length > 0 && (
          <div className="agent-registry" aria-label={t('agentConnections.admin.listLabel')}>
            <AgentRegistry apps={apps} selectedId={selectedApp?.clientId ?? null} onSelect={setSelectedClientId} t={t} />
            {selectedApp && <section className="agent-connections-admin__app" aria-labelledby={`agent-app-${selectedApp.clientId}`}>
                <Button variant="outline" className="agent-registry__back" onClick={() => setSelectedClientId(null)}>{t('agentConnections.admin.backToApps')}</Button>
                <div className="agent-connections-admin__app-head">
                  <div className="agent-connections-admin__app-title">
                    <h2 id={`agent-app-${selectedApp.clientId}`}>{selectedApp.displayName}</h2>
                    <StatusBadge status={selectedApp.enabled ? 'active' : 'disabled'} label={selectedApp.enabled ? t('agentConnections.admin.trusted') : t('agentConnections.admin.notTrusted')} />
                  </div>
                  <Button
                    variant="outline"
                    disabled={changingClientId === selectedApp.clientId || offline}
                    onClick={() => void handleToggle(selectedApp)}
                    aria-label={selectedApp.enabled
                      ? t('agentConnections.admin.distrustAction', { name: selectedApp.displayName })
                      : t('agentConnections.admin.trustAction', { name: selectedApp.displayName })}
                  >
                    {selectedApp.enabled ? t('agentConnections.admin.distrust') : t('agentConnections.admin.trust')}
                  </Button>
                </div>
                <p className="agent-connections-admin__next-request" role="note">{t('agentConnections.admin.nextRequest')}</p>
                <p className="agent-connections-admin__client-id">{t('agentConnections.admin.clientId')}: <code>{selectedApp.clientId}</code></p>
                <ul className="agent-connections-admin__connections">
                  {selectedApp.connections.length === 0 && (
                    <li className="agent-connections-admin__no-connections">{t('agentConnections.admin.noConnections')}</li>
                  )}
                  {selectedApp.connections.map((connection) => (
                    <li className="agent-connections-admin__connection" key={`${connection.person_id}-${connection.granted_at}`}>
                      <div>
                        <p className="agent-connections-admin__person">
                          {connection.person_name}
                          {connection.person_archived && <span className="agent-connections-admin__archived">{t('agentConnections.admin.archived')}</span>}
                        </p>
                        {connection.granted_at && (
                          <p className="agent-connections-admin__date">
                            {t('agentConnections.admin.connectedAt', { date: formatWibDateTime(connection.granted_at, locale) })}
                          </p>
                        )}
                      </div>
                      {connection.person_id && (
                        <Button
                          variant="outline"
                          disabled={offline}
                          onClick={() => setPending({
                            kind: 'revoke',
                            appName: selectedApp.displayName,
                            personName: connection.person_name ?? '',
                            personId: connection.person_id!,
                            clientId: selectedApp.clientId,
                          })}
                        >
                          {t('agentConnections.admin.revoke')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>}
          </div>
        )}
      </div>

      {pending?.kind === 'distrust' && (
        <ConfirmDialog
          open
          title={t('agentConnections.admin.confirmDistrust.title', { name: pending.appName })}
          body={t('agentConnections.admin.confirmDistrust.body')}
          confirmLabel={t('agentConnections.admin.distrust')}
          tone="destructive"
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'revoke' && (
        <ConfirmDialog
          open
          title={t('agentConnections.admin.confirmRevoke.title', { person: pending.personName, app: pending.appName })}
          body={t('agentConnections.admin.confirmRevoke.body')}
          confirmLabel={t('agentConnections.admin.revoke')}
          tone="destructive"
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </PageFamilyFrame>
  )
}
