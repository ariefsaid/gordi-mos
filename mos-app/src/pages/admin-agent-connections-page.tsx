import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { UserFacingError } from '@/lib/save-error'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TextInput } from '@/components/ui/text-input'
import { ErrorState, EmptyState, LoadingShell } from '@/components/ui/state-kit'
import { AdminSettingsNav } from '@/components/admin/admin-settings-nav'
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

interface AppView {
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
  const [formError, setFormError] = useState('')
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null)
  const [adding, setAdding] = useState(false)
  const [changingClientId, setChangingClientId] = useState<string | null>(null)
  const apps = useMemo(() => appViews(rows), [rows])
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }), [locale])

  useDocumentTitle(t('common.docTitle', { page: t('agentConnections.admin.title') }))

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      setRows(await listAdminAgentConnections())
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
      setFormError(t('agentConnections.admin.invalidClientId'))
      return
    }
    if (!normalizedName) {
      setFormError(t('agentConnections.admin.requiredName'))
      return
    }
    setFormError('')
    setAdding(true)
    try {
      await addTrustedAgentClient({ client_id: normalizedId, display_name: normalizedName })
      setClientId('')
      setDisplayName('')
      await load()
    } catch {
      setFormError(t('agentConnections.admin.addError'))
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

  const frameState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'default'
  return (
    <PageFamilyFrame
      family="management"
      title={t('agentConnections.admin.title')}
      jobSentence={t('agentConnections.admin.job')}
      state={frameState}
    >
      <AdminSettingsNav />
      <div className="agent-connections-admin">
        <p className="agent-connections-admin__intro">{t('agentConnections.admin.copy')}</p>
        <p className="agent-connections-admin__next-request" role="note">{t('agentConnections.admin.nextRequest')}</p>
        {actionNotice && (
          <p
            className={actionNotice.role === 'status' ? 'agent-connections-admin__notice' : 'agent-connections-admin__error'}
            role={actionNotice.role}
          >
            {actionNotice.message}
          </p>
        )}

        <section className="agent-connections-admin__panel" aria-labelledby="agent-connections-add-title">
          <div className="agent-connections-admin__panel-head">
            <div>
              <h2 id="agent-connections-add-title">{t('agentConnections.admin.addTitle')}</h2>
              <p>{t('agentConnections.admin.addCopy')}</p>
            </div>
          </div>
          <form className="agent-connections-admin__form" onSubmit={(event) => void handleAdd(event)} noValidate>
            <TextInput
              id="agent-client-id"
              label={t('agentConnections.admin.clientId')}
              value={clientId}
              onChange={(event) => { setClientId(event.target.value); setFormError('') }}
              autoComplete="off"
              spellCheck={false}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              error={Boolean(formError) && !UUID_PATTERN.test(clientId.trim())}
              aria-describedby={formError ? 'agent-add-error' : 'agent-client-id-help'}
              disabled={adding}
            />
            <p id="agent-client-id-help" className="agent-connections-admin__field-help">{t('agentConnections.admin.clientIdHelp')}</p>
            <TextInput
              id="agent-display-name"
              label={t('agentConnections.admin.displayName')}
              value={displayName}
              onChange={(event) => { setDisplayName(event.target.value); setFormError('') }}
              autoComplete="off"
              maxLength={100}
              error={Boolean(formError) && !displayName.trim()}
              aria-describedby={formError ? 'agent-add-error' : undefined}
              disabled={adding}
            />
            {formError && <p id="agent-add-error" className="agent-connections-admin__error" role="alert">{formError}</p>}
            <Button variant="primary" type="submit" disabled={adding}>
              {adding ? t('agentConnections.admin.adding') : t('agentConnections.admin.add')}
            </Button>
          </form>
        </section>

        {loadState === 'loading' && <LoadingShell count={3} label={t('agentConnections.admin.loading')} />}
        {loadState === 'error' && (
          <ErrorState message={t('agentConnections.admin.loadError')} onRetry={() => void load()} />
        )}
        {loadState === 'loaded' && apps.length === 0 && (
          <EmptyState variant="next-step" title={t('agentConnections.admin.emptyTitle')} copy={t('agentConnections.admin.emptyCopy')} />
        )}
        {loadState === 'loaded' && apps.length > 0 && (
          <div className="agent-connections-admin__apps" aria-label={t('agentConnections.admin.listLabel')}>
            {apps.map((app) => (
              <section className="agent-connections-admin__app" key={app.clientId} aria-labelledby={`agent-app-${app.clientId}`}>
                <div className="agent-connections-admin__app-head">
                  <div className="agent-connections-admin__app-title">
                    <h2 id={`agent-app-${app.clientId}`}>{app.displayName}</h2>
                    <span className={`agent-connections-admin__status${app.enabled ? ' agent-connections-admin__status--trusted' : ''}`}>
                      {app.enabled ? t('agentConnections.admin.trusted') : t('agentConnections.admin.notTrusted')}
                    </span>
                  </div>
                  <Button
                    variant={app.enabled ? 'destructive' : 'outline'}
                    disabled={changingClientId === app.clientId}
                    onClick={() => void handleToggle(app)}
                    aria-label={app.enabled
                      ? t('agentConnections.admin.distrustAction', { name: app.displayName })
                      : t('agentConnections.admin.trustAction', { name: app.displayName })}
                  >
                    {app.enabled ? t('agentConnections.admin.distrust') : t('agentConnections.admin.trust')}
                  </Button>
                </div>
                <ul className="agent-connections-admin__connections">
                  {app.connections.length === 0 && (
                    <li className="agent-connections-admin__no-connections">{t('agentConnections.admin.noConnections')}</li>
                  )}
                  {app.connections.map((connection) => (
                    <li className="agent-connections-admin__connection" key={`${connection.person_id}-${connection.granted_at}`}>
                      <div>
                        <p className="agent-connections-admin__person">
                          {connection.person_name}
                          {connection.person_archived && <span className="agent-connections-admin__archived">{t('agentConnections.admin.archived')}</span>}
                        </p>
                        {connection.granted_at && (
                          <p className="agent-connections-admin__date">
                            {t('agentConnections.admin.connectedAt', { date: formatter.format(new Date(connection.granted_at)) })}
                          </p>
                        )}
                      </div>
                      {connection.person_id && (
                        <Button
                          variant="outline"
                          onClick={() => setPending({
                            kind: 'revoke',
                            appName: app.displayName,
                            personName: connection.person_name ?? '',
                            personId: connection.person_id!,
                            clientId: app.clientId,
                          })}
                        >
                          {t('agentConnections.admin.revoke')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
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
