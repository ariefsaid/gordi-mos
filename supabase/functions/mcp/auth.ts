/**
 * Bearer-token validation for the MCP server. Pure (WebCrypto + injected fetch), so it runs in
 * Deno and in Vitest.
 *
 * A token is accepted only when ALL hold: an asymmetric signature (ES256 or RS256) verifies against
 * the login service's published keys; `iss` is that service; the token is unexpired; `aud` contains
 * this server's resource identifier; and `client_id`, `person_id` and `org_id` are present. An app
 * session token (no MCP audience, no client_id) therefore never passes. HMAC and `none` algorithms
 * are refused, so a shared secret is never needed here.
 */
export interface AgentClaims {
  sub: string
  client_id: string
  person_id: string
  org_id: string
}

export type TokenVerdict = { ok: true; claims: AgentClaims } | { ok: false; reason: string }

export interface AuthConfig {
  resource: string
  issuer: string
  jwksUrl: string
  fetch: typeof fetch
  now: () => number // seconds
}

interface Jwk extends JsonWebKey { kid?: string }

const KEY_ALGS: Record<string, { import: RsaHashedImportParams | EcKeyImportParams; verify: AlgorithmIdentifier | EcdsaParams | RsaPssParams; kty: string }> = {
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' }, kty: 'EC' },
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' }, kty: 'RSA' },
}

const JWKS_TTL_MS = 10 * 60_000
const JWKS_REFETCH_MIN_MS = 30_000
// ponytail: per-isolate key cache; a rotation is picked up by the unknown-kid refetch (at most once per 30 s).
let jwksCache: { url: string; keys: Jwk[]; fetchedAt: number } | null = null

export function resetJwksCache(): void { jwksCache = null }

async function loadKeys(cfg: AuthConfig, forceRefresh: boolean): Promise<Jwk[]> {
  const nowMs = cfg.now() * 1000
  if (jwksCache && jwksCache.url === cfg.jwksUrl) {
    const age = nowMs - jwksCache.fetchedAt
    if (!forceRefresh && age < JWKS_TTL_MS) return jwksCache.keys
    if (forceRefresh && age < JWKS_REFETCH_MIN_MS) return jwksCache.keys
  }
  const res = await cfg.fetch(cfg.jwksUrl, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`jwks ${res.status}`)
  const body = (await res.json()) as { keys?: Jwk[] }
  const keys = Array.isArray(body.keys) ? body.keys : []
  jwksCache = { url: cfg.jwksUrl, keys, fetchedAt: nowMs }
  return keys
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function parseSegment(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b64urlToBytes(s)))
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export async function verifyAgentToken(token: string, cfg: AuthConfig): Promise<TokenVerdict> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const header = parseSegment(parts[0])
  const payload = parseSegment(parts[1])
  if (!header || !payload) return { ok: false, reason: 'malformed' }

  const alg = KEY_ALGS[String(header.alg)]
  if (!alg) return { ok: false, reason: 'alg' }

  let verified = false
  try {
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const sig = b64urlToBytes(parts[2])
    const kid = str(header.kid)
    const findKey = (keys: Jwk[]) =>
      keys.find((k) => k.kty === alg.kty && (kid === null || k.kid === kid))
    let key = findKey(await loadKeys(cfg, false))
    if (!key) key = findKey(await loadKeys(cfg, true))
    if (!key) return { ok: false, reason: 'unknown_key' }
    const cryptoKey = await crypto.subtle.importKey('jwk', key, alg.import, false, ['verify'])
    verified = await crypto.subtle.verify(alg.verify, cryptoKey, sig, signed)
  } catch {
    return { ok: false, reason: 'signature' }
  }
  if (!verified) return { ok: false, reason: 'signature' }

  if (payload.iss !== cfg.issuer) return { ok: false, reason: 'iss' }
  if (typeof payload.exp !== 'number' || payload.exp <= cfg.now()) return { ok: false, reason: 'exp' }
  if (typeof payload.nbf === 'number' && payload.nbf > cfg.now()) return { ok: false, reason: 'nbf' }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes(cfg.resource)) return { ok: false, reason: 'aud' }

  const client_id = str(payload.client_id)
  const person_id = str(payload.person_id)
  const org_id = str(payload.org_id)
  const sub = str(payload.sub)
  if (!client_id) return { ok: false, reason: 'client_id' }
  if (!person_id || !org_id || !sub) return { ok: false, reason: 'claims' }
  return { ok: true, claims: { sub, client_id, person_id, org_id } }
}
