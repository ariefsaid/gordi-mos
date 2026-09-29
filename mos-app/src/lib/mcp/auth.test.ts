// @vitest-environment node
// AC-029 token validation seam: every refusal reason, and the accepted shape.
import { beforeEach, describe, expect, it } from 'vitest'
import { resetJwksCache, verifyAgentToken } from './../../../../supabase/functions/mcp/auth.ts'
import { goodClaims, ISSUER, JWKS_URL, makeFetch, makeKeys, NOW, omit, RESOURCE, signJwt } from './testKit.ts'

const cfgFor = (fetchFn: typeof fetch, now = NOW) => ({ resource: RESOURCE, issuer: ISSUER, jwksUrl: JWKS_URL, fetch: fetchFn, now: () => now })

describe('verifyAgentToken', () => {
  beforeEach(() => { resetJwksCache() })

  it('accepts a signed agent token and returns the caller identity', async () => {
    const keys = await makeKeys()
    const v = await verifyAgentToken(await signJwt(keys, goodClaims()), cfgFor(makeFetch(keys).fetchFn))
    expect(v).toEqual({ ok: true, claims: { sub: 'user-1', client_id: 'client-1', person_id: 'person-1', org_id: 'org-1' } })
  })

  it('accepts an audience array that contains the resource', async () => {
    const keys = await makeKeys()
    const t = await signJwt(keys, { ...goodClaims(), aud: ['authenticated', RESOURCE] })
    expect((await verifyAgentToken(t, cfgFor(makeFetch(keys).fetchFn))).ok).toBe(true)
  })

  const refusals: [string, string, (c: Record<string, unknown>) => Record<string, unknown>][] = [
    ['expired', 'exp', (c) => ({ ...c, exp: NOW - 1 })],
    ['no exp', 'exp', (c) => omit(c, 'exp')],
    ['wrong audience', 'aud', (c) => ({ ...c, aud: 'authenticated' })],
    ['audience array without the resource', 'aud', (c) => ({ ...c, aud: ['authenticated'] })],
    ['foreign issuer', 'iss', (c) => ({ ...c, iss: 'https://evil.test/auth/v1' })],
    ['no client_id (an app session token)', 'client_id', (c) => omit(c, 'client_id')],
    ['empty client_id', 'client_id', (c) => ({ ...c, client_id: '' })],
    ['no person_id', 'claims', (c) => omit(c, 'person_id')],
    ['no org_id', 'claims', (c) => omit(c, 'org_id')],
    ['not yet valid', 'nbf', (c) => ({ ...c, nbf: NOW + 60 })],
  ]
  it.each(refusals)('refuses %s', async (_label, reason, mutate) => {
    const keys = await makeKeys()
    const v = await verifyAgentToken(await signJwt(keys, mutate(goodClaims())), cfgFor(makeFetch(keys).fetchFn))
    expect(v).toEqual({ ok: false, reason })
  })

  it('refuses a token signed by a different key', async () => {
    const [keys, other] = [await makeKeys(), await makeKeys()]
    const v = await verifyAgentToken(await signJwt(other, goodClaims()), cfgFor(makeFetch(keys).fetchFn))
    expect(v).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses a tampered payload', async () => {
    const keys = await makeKeys()
    const [h, , s] = (await signJwt(keys, goodClaims())).split('.')
    const forged = Buffer.from(JSON.stringify({ ...goodClaims(), person_id: 'someone-else' })).toString('base64url')
    expect((await verifyAgentToken(`${h}.${forged}.${s}`, cfgFor(makeFetch(keys).fetchFn))).ok).toBe(false)
  })

  it.each(['HS256', 'none'])('refuses the %s algorithm without fetching any key', async (alg) => {
    const keys = await makeKeys()
    const kit = makeFetch(keys)
    const v = await verifyAgentToken(await signJwt(keys, goodClaims(), { alg, kid: 'k1' }), cfgFor(kit.fetchFn))
    expect(v).toEqual({ ok: false, reason: 'alg' })
    expect(kit.calls).toHaveLength(0)
  })

  it.each(['', 'abc', 'a.b', 'a.b.c.d', 'x.y.z'])('refuses the malformed token %j', async (t) => {
    const keys = await makeKeys()
    expect((await verifyAgentToken(t, cfgFor(makeFetch(keys).fetchFn))).ok).toBe(false)
  })

  it('refetches the key set once when the key id is unknown, then accepts a rotated key', async () => {
    const oldKeys = await makeKeys('k1')
    const newKeys = await makeKeys('k2')
    let served = oldKeys
    const kit = makeFetch(oldKeys)
    const fetchFn = ((i: RequestInfo | URL, init?: RequestInit) =>
      String(i) === JWKS_URL ? Promise.resolve(Response.json(served.jwks)) : kit.fetchFn(i, init)) as typeof fetch
    let now = NOW
    const cfg = { ...cfgFor(fetchFn), now: () => now }
    expect((await verifyAgentToken(await signJwt(oldKeys, goodClaims()), cfg)).ok).toBe(true)
    served = newKeys
    now += 31 // past the refetch floor
    const t = await signJwt(newKeys, goodClaims(), { alg: 'ES256', kid: 'k2' })
    expect((await verifyAgentToken(t, cfg)).ok).toBe(true)
  })

  it('does not hammer the key endpoint: unknown kids refetch at most once per window', async () => {
    const keys = await makeKeys()
    const kit = makeFetch(keys)
    const cfg = cfgFor(kit.fetchFn)
    const t = await signJwt(keys, goodClaims(), { alg: 'ES256', kid: 'nope' })
    await verifyAgentToken(t, cfg)
    await verifyAgentToken(t, cfg)
    await verifyAgentToken(t, cfg)
    expect(kit.calls.filter((c) => c.url === JWKS_URL)).toHaveLength(1)
  })

  it('refuses when the key endpoint is unreachable', async () => {
    const failing = (async () => { throw new Error('down') }) as typeof fetch
    const keys = await makeKeys()
    expect((await verifyAgentToken(await signJwt(keys, goodClaims()), cfgFor(failing))).ok).toBe(false)
  })
})
