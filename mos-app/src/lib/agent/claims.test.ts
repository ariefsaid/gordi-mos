// requireVerifiedClaims: the one gate an edge handler passes before it reads any claim. The token is
// verified first; claims are decoded only from a token the verifier accepted.
import { describe, it, expect, vi } from 'vitest'
import { requireVerifiedClaims } from './../../../../supabase/functions/_shared/claims'

function makeJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

const request = (authorization?: string) =>
  new Request('http://localhost/fn', { method: 'POST', headers: authorization ? { Authorization: authorization } : {} })

const accepting = (id = 'user-1') => vi.fn(() => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id } }, error: null })) } }))
const refusing = () => vi.fn(() => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('bad signature') })) } }))

describe('requireVerifiedClaims', () => {
  it('returns the claims of a token the verifier accepts', async () => {
    const jwt = makeJwt({ org_id: 'org-1', person_id: 'person-1', access_roles: ['member'] })
    const verdict = await requireVerifiedClaims(request(`Bearer ${jwt}`), accepting())
    expect(verdict).toEqual({
      ok: true,
      claims: { jwt, userId: 'user-1', orgId: 'org-1', personId: 'person-1', accessRoles: ['member'] },
    })
  })

  it('refuses a token the verifier rejects, whatever claims it carries', async () => {
    const forged = makeJwt({ org_id: 'org-1', person_id: 'person-1', access_roles: ['admin'] })
    expect(await requireVerifiedClaims(request(`Bearer ${forged}`), refusing())).toEqual({ ok: false, detail: 'invalid JWT' })
  })

  it('refuses when the verifier itself fails', async () => {
    const verifier = vi.fn(() => ({ auth: { getUser: vi.fn(async () => { throw new Error('unreachable') }) } }))
    expect(await requireVerifiedClaims(request(`Bearer ${makeJwt({ org_id: 'o', person_id: 'p' })}`), verifier))
      .toEqual({ ok: false, detail: 'invalid JWT' })
  })

  it('refuses a missing or non-bearer Authorization header without calling the verifier', async () => {
    const verifier = accepting()
    expect(await requireVerifiedClaims(request(), verifier)).toEqual({ ok: false, detail: 'missing Authorization header' })
    expect(await requireVerifiedClaims(request('Basic abc'), verifier)).toEqual({ ok: false, detail: 'missing Authorization header' })
    expect(verifier).not.toHaveBeenCalled()
  })

  it('refuses a token issued to an agent client, even with a null value, before verifying', async () => {
    const verifier = accepting()
    for (const clientId of ['client-1', null]) {
      const jwt = makeJwt({ org_id: 'o', person_id: 'p', client_id: clientId })
      expect(await requireVerifiedClaims(request(`Bearer ${jwt}`), verifier))
        .toEqual({ ok: false, detail: 'agent tokens are not accepted here' })
    }
    expect(verifier).not.toHaveBeenCalled()
  })

  it('refuses a verified token without org_id or person_id', async () => {
    for (const payload of [{ person_id: 'p' }, { org_id: 'o' }, { org_id: 1, person_id: 'p' }]) {
      expect(await requireVerifiedClaims(request(`Bearer ${makeJwt(payload)}`), accepting()))
        .toEqual({ ok: false, detail: 'missing org_id/person_id claim' })
    }
  })

  it('refuses an unreadable payload', async () => {
    for (const jwt of ['not-a-jwt', 'a.b', `header.${Buffer.from('not-json').toString('base64url')}.sig`]) {
      expect(await requireVerifiedClaims(request(`Bearer ${jwt}`), accepting()))
        .toEqual({ ok: false, detail: 'missing org_id/person_id claim' })
    }
  })

  it('base64url-decodes the payload and defaults access roles to none', async () => {
    const jwt = makeJwt({ org_id: 'org-1', person_id: 'p'.repeat(50), access_roles: 'admin' })
    const verdict = await requireVerifiedClaims(request(`Bearer ${jwt}`), accepting())
    expect(verdict.ok && verdict.claims.orgId).toBe('org-1')
    expect(verdict.ok && verdict.claims.accessRoles).toEqual([])
  })
})
