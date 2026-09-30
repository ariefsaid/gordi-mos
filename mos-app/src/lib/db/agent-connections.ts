import { supabase } from '@/lib/supabase'

const shared = () => supabase.schema('shared')

export interface AdminAgentConnectionRow {
  client_id: string
  display_name: string
  enabled: boolean
  person_id: string | null
  person_name: string | null
  person_archived: boolean | null
  granted_at: string | null
  scopes: string | null
}

export interface TrustedAgentClient {
  client_id: string
  display_name: string
  enabled: boolean
}

export type NewTrustedAgentClient = Pick<TrustedAgentClient, 'client_id' | 'display_name'>

export interface OwnAgentConnection {
  clientId: string
  /** Null when Auth has a grant whose client ID is absent from this organization's trusted app list. */
  displayName: string | null
  grantedAt: string
  scopes: string[]
}

export interface OwnAgentConnectionsResult {
  oauthAvailable: boolean
  connections: OwnAgentConnection[]
}

function fail(action: string, error: unknown): Error {
  console.error(`[agent-connections] ${action} failed`, error)
  return new Error(`Couldn't ${action}. Try again.`)
}

export async function listAdminAgentConnections(): Promise<AdminAgentConnectionRow[]> {
  const { data, error } = await shared().rpc('admin_list_agent_connections')
  if (error) throw fail('load connected agents', error)
  return (data ?? []) as AdminAgentConnectionRow[]
}

export async function addTrustedAgentClient(client: NewTrustedAgentClient): Promise<void> {
  const { error } = await shared().from('trusted_agent_clients').insert({
    client_id: client.client_id.toLowerCase(),
    display_name: client.display_name,
  })
  if (error) throw fail('add trusted agent', error)
}

export async function setTrustedAgentEnabled(clientId: string, enabled: boolean): Promise<void> {
  const { error } = await shared().from('trusted_agent_clients').update({ enabled }).eq('client_id', clientId)
  if (error) throw fail('update trusted agent', error)
}

export async function revokeAdminAgentConnection(personId: string, clientId: string): Promise<boolean> {
  const { data, error } = await shared().rpc('admin_revoke_agent_connection', {
    p_person_id: personId,
    p_client_id: clientId,
  })
  if (error) throw fail('revoke agent connection', error)
  return data === true
}

function isOAuthFeatureDisabled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const authError = error as { code?: unknown; status?: unknown }
  return authError.code === 'feature_disabled' && authError.status === 404
}

/** Reads only the current user's OAuth grants; names come only from the org's trusted allow-list. */
export async function listOwnAgentConnections(): Promise<OwnAgentConnectionsResult> {
  const [grantsResult, trustedResult] = await Promise.all([
    supabase.auth.oauth.listGrants(),
    shared().from('trusted_agent_clients').select('client_id, display_name'),
  ])
  if (grantsResult.error && isOAuthFeatureDisabled(grantsResult.error)) {
    return { oauthAvailable: false, connections: [] }
  }
  if (grantsResult.error) throw fail('load your connected agents', grantsResult.error)
  if (trustedResult.error) throw fail('load your connected agents', trustedResult.error)

  const trustedNames = new Map<string, string>(
    (trustedResult.data ?? []).map((client) => [client.client_id, client.display_name]),
  )
  const connections = (grantsResult.data ?? []).map((grant) => {
    const clientId = grant.client.id.toLowerCase()
    const displayName = trustedNames.get(clientId) ?? null
    return { clientId, displayName, grantedAt: grant.granted_at, scopes: grant.scopes }
  })
  return { oauthAvailable: true, connections }
}

/** Supabase Auth binds this request to the current bearer user; no user id is accepted here. */
export async function revokeOwnAgentConnection(clientId: string): Promise<void> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
  if (error) throw fail('revoke your agent connection', error)
}
