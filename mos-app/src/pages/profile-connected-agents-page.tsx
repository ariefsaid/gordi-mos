import { useCallback, useEffect, useState } from 'react'
import { formatWibDateTime } from '@/lib/format/date'
import { useIsOffline } from '@/shell/use-is-offline'
import { OfflineNotice } from '@/components/ui/offline-notice'
import { useT } from '@/i18n/use-t'
import { UserFacingError } from '@/lib/save-error'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState, ErrorState, LoadingShell } from '@/components/ui/state-kit'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { listOwnAgentConnections, revokeOwnAgentConnection, type OwnAgentConnection } from '@/lib/db/agent-connections'
import { ProfileSectionNav } from '@/components/profile/profile-section-nav'
import './profile-connected-agents-page.css'

export function ProfileConnectedAgentsPage() {
  const t = useT()
  const { locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [oauthAvailable, setOauthAvailable] = useState(true)
  const [connections, setConnections] = useState<OwnAgentConnection[]>([])
  const [pending, setPending] = useState<OwnAgentConnection | null>(null)
  const [message, setMessage] = useState('')
  const offline = useIsOffline()
  useDocumentTitle(t('common.docTitle', { page: t('agentConnections.self.title') }))

  const load = useCallback(async () => {
    setLoading(true); setFailed(false); setOauthAvailable(true)
    try { const result = await listOwnAgentConnections(); setConnections(result.connections); setOauthAvailable(result.oauthAvailable) }
    catch { setFailed(true) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function handleRevoke() {
    if (!pending) return
    try {
      await revokeOwnAgentConnection(pending.clientId)
      setMessage(t('agentConnections.self.revoked', { name: pending.displayName ?? t('agentConnections.self.unknownApp') }))
      setPending(null)
      await load()
    } catch { throw new UserFacingError(t('agentConnections.self.revokeError')) }
  }

  return (
    <PageFamilyFrame family="management" title={t('dest.profile')} jobSentence={t('agentConnections.self.job')}
      state={loading ? 'loading' : failed ? 'error' : 'default'}>
      <div className="agent-connections-self">
        <ProfileSectionNav />
        <OfflineNotice />
        {message && <p className="agent-connections-self__success" role="status">{message}</p>}
        {loading && <LoadingShell count={2} label={t('agentConnections.self.loading')} />}
        {failed && <ErrorState message={t('agentConnections.self.loadError')} onRetry={() => void load()} />}
        {!loading && !failed && !oauthAvailable && <EmptyState variant="blank" title={t('agentConnections.self.unavailableTitle')} copy={t('agentConnections.self.unavailableCopy')} />}
        {!loading && !failed && oauthAvailable && connections.length === 0 && <EmptyState variant="blank" title={t('agentConnections.self.emptyTitle')} copy={t('agentConnections.self.emptyCopy')} />}
        {!loading && !failed && oauthAvailable && connections.length > 0 && <p className="agent-connections-self__next-request" role="note">{t('agentConnections.self.nextRequest')}</p>}
        {!loading && !failed && oauthAvailable && connections.length > 0 && <ul className="agent-connections-self__list" aria-label={t('agentConnections.self.listLabel')}>
          {connections.map((connection) => <li className="agent-connections-self__item" key={connection.clientId}>
            <div className="agent-connections-self__identity">
              <h2>{connection.displayName ?? t('agentConnections.self.unknownApp')}</h2>
              {!connection.displayName && <p className="agent-connections-self__client-id">{t('agentConnections.self.unknownAppClient', { id: connection.clientId })}</p>}
            </div>
            <div className="agent-connections-self__grant">
              <p className="agent-connections-self__date">{t('agentConnections.self.connectedAt', { date: formatWibDateTime(connection.grantedAt, locale) })}</p>
              {connection.scopes.length > 0 && <p className="agent-connections-self__scopes"><span>{t('agentConnections.self.scopesLabel')}: </span>{connection.scopes.join(', ')}</p>}
            </div>
            <div className="agent-connections-self__decision">
              <Button variant="outline" disabled={offline} onClick={() => setPending(connection)} aria-label={t('agentConnections.self.revokeAction', {
                name: connection.displayName ?? `${t('agentConnections.self.unknownApp')} ${connection.clientId}`,
              })}>{t('agentConnections.self.revoke')}</Button>
            </div>
          </li>)}
        </ul>}
      </div>
      {pending && <ConfirmDialog open title={t('agentConnections.self.confirm.title', { name: pending.displayName ?? t('agentConnections.self.unknownApp') })}
        body={t('agentConnections.self.confirm.body')} confirmLabel={t('agentConnections.self.revoke')} tone="destructive"
        onConfirm={handleRevoke} onCancel={() => setPending(null)} />}
    </PageFamilyFrame>
  )
}
