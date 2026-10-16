import type { AppView } from '@/pages/admin-agent-connections-page'
import type { Translate } from '@/i18n/use-t'

export function AgentRegistry({ apps, selectedId, onSelect, t }: {
  apps: AppView[]
  selectedId: string | null
  onSelect: (clientId: string) => void
  t: Translate
}) {
  return <nav className={`agent-registry__list${selectedId ? ' agent-registry__list--has-detail' : ''}`} aria-label={t('agentConnections.admin.listLabel')}>
    {apps.map((app) => <button type="button" className={`agent-registry__item${selectedId === app.clientId ? ' agent-registry__item--selected' : ''}`} key={app.clientId} onClick={() => onSelect(app.clientId)}>
      <span className="agent-registry__item-name">{app.displayName}</span>
      <span className="agent-registry__item-meta">{app.enabled ? t('agentConnections.admin.trusted') : t('agentConnections.admin.notTrusted')} · {t(app.connections.length === 1 ? 'agentConnections.admin.connections.one' : 'agentConnections.admin.connections.other', { count: app.connections.length })}</span>
    </button>)}
  </nav>
}
