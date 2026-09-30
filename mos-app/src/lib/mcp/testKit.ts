// Shared fixtures for the MCP server tests: a real ES256 key pair, signed tokens and a recording fetch.
export const RESOURCE = 'https://mos.test/functions/v1/mcp'
export const ISSUER = 'https://mos.test/auth/v1'
export const JWKS_URL = 'http://kong:8000/auth/v1/.well-known/jwks.json'
export const DATA_API = 'http://kong:8000'
export const ANON_KEY = 'anon-public-key'
export const NOW = 1_800_000_000

const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url')
const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

export interface Keys { privateKey: CryptoKey; jwks: { keys: JsonWebKey[] } }

export async function makeKeys(kid = 'k1'): Promise<Keys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return { privateKey: pair.privateKey, jwks: { keys: [{ ...jwk, kid, alg: 'ES256', use: 'sig' } as JsonWebKey] } }
}

export const goodClaims = () => ({
  sub: 'user-1', iss: ISSUER, aud: RESOURCE, exp: NOW + 3600, role: 'authenticated',
  client_id: 'client-1', person_id: 'person-1', org_id: 'org-1', session_id: 's-1',
})

export async function signJwt(
  keys: Keys, claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'ES256', kid: 'k1', typ: 'JWT' },
): Promise<string> {
  const input = `${enc(header)}.${enc(claims)}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(input))
  return `${input}.${b64url(sig)}`
}

export interface Call { url: string; init: RequestInit }

/** Recording fetch: serves the key set at JWKS_URL and `dataResponse` for every data-API call. */
export function makeFetch(keys: Keys, dataResponse: (init: RequestInit) => Response | Promise<Response> = () => Response.json({ item: { ok: true } })) {
  const calls: Call[] = []
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (url === JWKS_URL) return Response.json(keys.jwks)
    if (url.startsWith(`${DATA_API}/rest/v1/rpc/`)) {
      return dataResponse(init)
    }
    throw new Error(`unexpected outbound call: ${url}`)
  }) as typeof fetch
  const dataCalls = () => calls.filter((c) => c.url !== JWKS_URL)
  return { fetchFn, calls, dataCalls }
}

export const headerOf = (init: RequestInit, name: string): string | null => new Headers(init.headers).get(name)

export const omit = (o: Record<string, unknown>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))
