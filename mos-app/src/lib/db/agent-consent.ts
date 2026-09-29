import { supabase } from '@/lib/supabase'
import { isSafeAgentRedirect } from '@/lib/agent-redirect'

// The consent page's reads and writes. The sign-in service owns the request and the decision;
// the database owns whether the agent app is trusted and whether this person may connect one
// (ADR-0060 D4/D5). Nothing here reads, stores or returns a code or token.

export interface ConsentRequest {
  authorizationId: string
  clientId: string
  redirectUri: string
  userEmail: string
}

export type ConsentLoad =
  | { kind: 'redirect'; url: string }
  | { kind: 'request'; request: ConsentRequest }
  | { kind: 'unknown' }

export interface ConsentGate {
  canConnect: boolean
  /** The admin-set name from the allow-list; null when the client is not trusted and enabled. */
  trustedName: string | null
}

const oauth = () => supabase.auth.oauth
const shared = () => supabase.schema('shared')

function fail(action: string, error: unknown): Error {
  console.error(`[agent-consent] ${action} failed`, error)
  return new Error(`Couldn't ${action}. Try again.`)
}

function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined
}

export async function loadConsentRequest(authorizationId: string): Promise<ConsentLoad> {
  const { data, error } = await oauth().getAuthorizationDetails(authorizationId)
  if (error) {
    const status = statusOf(error)
    // A 4xx is the service saying this request is gone or was never valid; anything else is ours to retry.
    if (status !== undefined && status >= 400 && status < 500) return { kind: 'unknown' }
    throw fail('load this request', error)
  }
  if (!data) return { kind: 'unknown' }
  if ('redirect_url' in data) return { kind: 'redirect', url: data.redirect_url }
  return {
    kind: 'request',
    request: {
      authorizationId: data.authorization_id,
      clientId: data.client.id,
      redirectUri: data.redirect_uri,
      userEmail: data.user.email,
    },
  }
}

export async function loadConsentGate(clientId: string): Promise<ConsentGate> {
  const [allowed, trusted] = await Promise.all([
    shared().rpc('role_authority_allows', { p_action: 'agent.connect' }),
    shared().from('trusted_agent_clients').select('display_name').eq('client_id', clientId).eq('enabled', true).maybeSingle(),
  ])
  if (allowed.error) throw fail('check your access', allowed.error)
  if (trusted.error) throw fail('check the agent app', trusted.error)
  const row: { display_name?: unknown } | null = trusted.data
  return {
    canConnect: allowed.data === true,
    trustedName: typeof row?.display_name === 'string' ? row.display_name : null,
  }
}

/** Approve or deny; returns the address to send the browser to. */
export async function decideConsent(authorizationId: string, decision: 'approve' | 'deny'): Promise<string> {
  const options = { skipBrowserRedirect: true }
  const { data, error } =
    decision === 'approve'
      ? await oauth().approveAuthorization(authorizationId, options)
      : await oauth().denyAuthorization(authorizationId, options)
  if (error || !data) throw fail(decision === 'approve' ? 'allow this agent' : 'deny this request', error)
  if (!isSafeAgentRedirect(data.redirect_url)) throw fail('follow the agent’s return address', 'return address refused')
  return data.redirect_url
}
