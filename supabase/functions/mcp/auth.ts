// Bearer-token validation for the MCP server. Pure (WebCrypto + injected fetch), so it runs in
// Deno and in Vitest.
//
// A token is accepted only when ALL hold: an asymmetric signature (ES256 or RS256) verifies against
// the login service's published keys, chosen by the key's declared use (`sig`) and algorithm; `iss`
// is that service; the token is unexpired; `aud` contains this server's resource identifier; `role`
// is the signed-in user role (`authenticated`); and `client_id`, `person_id` and `org_id` are
// present. An app session token (no MCP audience, no client_id) therefore never passes. HMAC and
// `none` algorithms are refused, so a shared secret is never needed here.
import { b64urlToBytes, parseSegment } from '../_shared/jwtSegment.ts'

export type AgentClaims = {
  sub: string
  client_id: string
  person_id: string
  org_id: string
}

export type TokenVerdict = { ok: true; claims: AgentClaims } | { ok: false; reason: string }

export type AuthConfig = {
  resource: string
  issuer: string
  jwksUrl: string
  fetch: typeof fetch
  now: () => number // seconds
}

type Jwk = JsonWebKey & { kid?: string }

const KEY_ALGS: Record<string, { import: RsaHashedImportParams | EcKeyImportParams; verify: AlgorithmIdentifier | EcdsaParams | RsaPssParams; kty: string }> = {
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' }, kty: 'EC' },
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' }, kty: 'RSA' },
}

const JWKS_TTL_MS = 10 * 60_000
const JWKS_ATTEMPT_MIN_MS = 30_000
const JWKS_FETCH_TIMEOUT_MS = 5_000

// ponytail: per-isolate key cache. At most one key fetch per 30 s (success or failure), concurrent
// misses share one fetch, and each fetch is bounded; a rotation is picked up by the next attempt.
let jwksCache: { url: string; keys: Jwk[]; fetchedAt: number } | null = null
let lastAttempt: { url: string; at: number } | null = null
let inflight: { url: string; promise: Promise<Jwk[]> } | null = null

export function resetJwksCache(): void {
  jwksCache = null
  lastAttempt = null
  inflight = null
}

async function fetchKeys(config: AuthConfig, nowMs: number): Promise<Jwk[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS)
  // The abort signal ends a cooperative fetch; the race bounds one that ignores it.
  const timedOut = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('jwks timeout')))
  })
  try {
    const response = await Promise.race([
      config.fetch(config.jwksUrl, { headers: { Accept: 'application/json' }, signal: controller.signal }),
      timedOut,
    ])
    if (!response.ok) throw new Error(`jwks ${response.status}`)
    const body = (await Promise.race([response.json(), timedOut])) as { keys?: Jwk[] }
    const keys = Array.isArray(body.keys) ? body.keys : []
    jwksCache = { url: config.jwksUrl, keys, fetchedAt: nowMs }
    return keys
  } finally {
    clearTimeout(timer)
  }
}

async function loadKeys(config: AuthConfig, forceRefresh: boolean): Promise<Jwk[]> {
  const nowMs = config.now() * 1000
  const cached = jwksCache && jwksCache.url === config.jwksUrl ? jwksCache : null
  const fresh = cached !== null && nowMs - cached.fetchedAt < JWKS_TTL_MS
  if (fresh && !forceRefresh) return cached.keys
  if (inflight && inflight.url === config.jwksUrl) return inflight.promise
  const recentlyTried = lastAttempt !== null && lastAttempt.url === config.jwksUrl && nowMs - lastAttempt.at < JWKS_ATTEMPT_MIN_MS
  if (recentlyTried) {
    if (fresh) return cached.keys
    throw new Error('jwks unavailable')
  }
  lastAttempt = { url: config.jwksUrl, at: nowMs }
  const promise = fetchKeys(config, nowMs)
  inflight = { url: config.jwksUrl, promise }
  try {
    return await promise
  } finally {
    if (inflight?.promise === promise) inflight = null
  }
}

// A key is eligible for a token when its declared use, operations and algorithm (each optional in a
// JWK) do not rule out verifying that token's algorithm.
const keyServes = (key: Jwk, alg: string, kty: string): boolean =>
  key.kty === kty
  && (key.use === undefined || key.use === 'sig')
  && (key.alg === undefined || key.alg === alg)
  && (key.key_ops === undefined || (Array.isArray(key.key_ops) && key.key_ops.includes('verify')))

const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

export async function verifyAgentToken(token: string, config: AuthConfig): Promise<TokenVerdict> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const header = parseSegment(parts[0])
  const payload = parseSegment(parts[1])
  if (!header || !payload) return { ok: false, reason: 'malformed' }

  const algName = typeof header.alg === 'string' ? header.alg : ''
  if (!Object.hasOwn(KEY_ALGS, algName)) return { ok: false, reason: 'alg' }
  const alg = KEY_ALGS[algName]

  let verified = false
  try {
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const signature = b64urlToBytes(parts[2])
    const kid = nonEmpty(header.kid)
    const findKey = (keys: Jwk[]) =>
      keys.find((candidate) => keyServes(candidate, algName, alg.kty) && (kid === null || candidate.kid === kid))
    let key = findKey(await loadKeys(config, false))
    if (!key) key = findKey(await loadKeys(config, true))
    if (!key) return { ok: false, reason: 'unknown_key' }
    const cryptoKey = await crypto.subtle.importKey('jwk', key, alg.import, false, ['verify'])
    verified = await crypto.subtle.verify(alg.verify, cryptoKey, signature, signed)
  } catch {
    return { ok: false, reason: 'signature' }
  }
  if (!verified) return { ok: false, reason: 'signature' }

  if (payload.iss !== config.issuer) return { ok: false, reason: 'iss' }
  if (typeof payload.exp !== 'number' || payload.exp <= config.now()) return { ok: false, reason: 'exp' }
  if (typeof payload.nbf === 'number' && payload.nbf > config.now()) return { ok: false, reason: 'nbf' }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes(config.resource)) return { ok: false, reason: 'aud' }

  if (payload.role !== 'authenticated') return { ok: false, reason: 'role' }

  const client_id = nonEmpty(payload.client_id)
  const person_id = nonEmpty(payload.person_id)
  const org_id = nonEmpty(payload.org_id)
  const sub = nonEmpty(payload.sub)
  if (!client_id) return { ok: false, reason: 'client_id' }
  if (!person_id || !org_id || !sub) return { ok: false, reason: 'claims' }
  return { ok: true, claims: { sub, client_id, person_id, org_id } }
}
