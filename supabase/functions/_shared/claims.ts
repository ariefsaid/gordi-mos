/**
 * requireVerifiedClaims — the one gate an edge handler passes before it reads any claim.
 *
 * Order: a Bearer token is required; a token carrying `client_id` (issued to an agent client) is
 * refused before any verification work; the token is verified by the login service
 * (`auth.getUser(jwt)` on the verifier the caller supplies, service_role, D3); only then are
 * org_id/person_id/access_roles read from its payload (D1: the claim the SPA's
 * shared.custom_access_token_hook minted IS the authority, no `profiles` lookup).
 *
 * Pure (no Deno globals; the verifier is injected), so it runs in Deno and in Vitest.
 */
import { parseSegment } from './jwtSegment.ts'

export type ClaimsVerifier = {
  auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> }
}

export type VerifiedClaims = {
  jwt: string
  userId: string
  orgId: string
  personId: string
  accessRoles: string[]
}

export type ClaimsVerdict = { ok: true; claims: VerifiedClaims } | { ok: false; detail: string }

export async function requireVerifiedClaims(req: Request, verifier: () => ClaimsVerifier): Promise<ClaimsVerdict> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, detail: 'missing Authorization header' }
  const jwt = authHeader.slice(7)
  const payload = parseSegment(jwt.split('.')[1] ?? '')

  if (payload?.client_id !== undefined) return { ok: false, detail: 'agent tokens are not accepted here' }

  let userId: string
  try {
    const { data: { user }, error } = await verifier().auth.getUser(jwt)
    if (error || !user) return { ok: false, detail: 'invalid JWT' }
    userId = user.id
  } catch {
    return { ok: false, detail: 'invalid JWT' }
  }

  const orgId = payload?.org_id
  const personId = payload?.person_id
  if (typeof orgId !== 'string' || !orgId || typeof personId !== 'string' || !personId) {
    return { ok: false, detail: 'missing org_id/person_id claim' }
  }
  const roles = payload?.access_roles
  const accessRoles = Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : []
  return { ok: true, claims: { jwt, userId, orgId, personId, accessRoles } }
}
