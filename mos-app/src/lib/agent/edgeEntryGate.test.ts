// @vitest-environment node
// Every edge function passes requireVerifiedClaims before it reads a claim, and answers CORS only
// for configured app origins. The source scan fails when a new function skips the gate; the entry
// tests exercise the real index.ts wiring with Deno.serve captured.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient }))

const FUNCTIONS_DIR = join(__dirname, '../../../../supabase/functions')

// Functions that authenticate without the shared gate, each with the reason. Nothing else may.
const OWN_VERIFICATION: Record<string, { reason: string; calls: RegExp }> = {
  // Accepts only agent tokens, which the shared gate refuses: verifyAgentToken checks the signature
  // against the login service's published keys plus iss, aud, exp and the required claims.
  mcp: { reason: 'agent-token verification', calls: /\bverifyAgentToken\(/ },
}

const functionNames = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)

// Source with comments removed, so a mention in prose never satisfies or trips a check.
const code = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const entrySource = (name: string) =>
  ['index.ts', 'handler.ts']
    .map((f) => join(FUNCTIONS_DIR, name, f))
    .filter(existsSync)
    .map(code)
    .join('\n')

// The first point a request's body, claims or caller-bound client is used.
const FIRST_USE = /\breq\.(json|text|formData|arrayBuffer)\(|\breadCappedJson\(|\bverdict\.claims\b/

describe('edge function gate (source scan)', () => {
  it('finds the deployed functions', () => {
    expect(functionNames).toEqual(expect.arrayContaining(['agent-chat', 'compose-view', 'mcp']))
  })

  it.each(functionNames)('%s verifies the caller through the shared gate or its listed verifier', (name) => {
    const src = entrySource(name)
    const own = OWN_VERIFICATION[name]
    if (own) {
      expect(src).toMatch(own.calls)
      return
    }
    const gate = src.search(/\bconst\s+verdict\s*=\s*await\s+requireVerifiedClaims\(/)
    expect(gate, 'the gate is called and its verdict kept').toBeGreaterThanOrEqual(0)
    expect(src, 'a refused verdict returns').toMatch(/if\s*\(\s*!verdict\.ok\s*\)\s*\{?\s*return\b/)
    const firstUse = src.search(FIRST_USE)
    expect(firstUse, 'the request is used only after the gate').toBeGreaterThan(gate)
  })

  // The protected-resource metadata document is public discovery data any client may read.
  const PUBLIC_WILDCARD = ['mcp/handler.ts']

  it.each(functionNames)('%s never sets a wildcard CORS origin outside public discovery data', (name) => {
    for (const f of readdirSync(join(FUNCTIONS_DIR, name)).filter((f) => f.endsWith('.ts'))) {
      if (PUBLIC_WILDCARD.includes(`${name}/${f}`)) continue
      expect(code(join(FUNCTIONS_DIR, name, f))).not.toMatch(/['"`]Access-Control-Allow-Origin['"`]\s*[:,]\s*['"`]\*['"`]/i)
    }
  })

  it('decodes token segments only through the shared helper, used by the gate and the agent-token verifier', () => {
    const decoders: string[] = []
    const segmentUsers: string[] = []
    const walk = (dir: string) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, d.name)
        if (d.isDirectory()) { walk(p); continue }
        if (!d.name.endsWith('.ts')) continue
        const src = code(p)
        const rel = p.slice(FUNCTIONS_DIR.length + 1)
        if (/\batob\(/.test(src)) decoders.push(rel)
        if (/\bjwtSegment(\.ts)?['"`]/.test(src)) segmentUsers.push(rel)
      }
    }
    walk(FUNCTIONS_DIR)
    expect(decoders).toEqual(['_shared/jwtSegment.ts'])
    expect(segmentUsers.sort()).toEqual(['_shared/claims.ts', 'mcp/auth.ts'])
  })
})

type Serve = (req: Request) => Promise<Response>

function makeJwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.sig`
}

const entries = import.meta.glob('../../../../supabase/functions/*/index.ts') as Record<string, () => Promise<unknown>>
const GATED = ['agent-chat', 'compose-view'].map((name) => {
  const load = entries[`../../../../supabase/functions/${name}/index.ts`]
  if (!load) throw new Error(`no entry point for ${name}`)
  return [name, load] as const
})

async function loadServe(load: () => Promise<unknown>, env: Record<string, string> = {}): Promise<Serve> {
  let serve: Serve | undefined
  vi.stubGlobal('Deno', { serve: (h: Serve) => { serve = h }, env: { get: (k: string) => env[k] } })
  vi.resetModules()
  await load()
  if (!serve) throw new Error('index.ts did not register a handler')
  return serve
}

describe.each(GATED)('%s entry point', (_name, load) => {
  beforeEach(() => { createClient.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('refuses a token the verifier rejects, whatever claims it carries', async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: new Error('bad signature') }))
    createClient.mockReturnValue({ auth: { getUser } })
    const serve = await loadServe(load, { AGENT_MODEL_DEFAULT: 'm', AGENT_MODEL_API_KEY: 'k', AGENT_MODEL_BASE_URL: 'http://model' })
    const forged = makeJwt({ org_id: 'org-1', person_id: 'person-1', access_roles: ['admin'] })
    const res = await serve(new Request('http://localhost/fn', {
      method: 'POST',
      headers: { Authorization: `Bearer ${forged}`, 'Content-Type': 'application/json' },
      body: '{}',
    }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'UNAUTHORIZED', detail: 'invalid JWT' })
    expect(getUser).toHaveBeenCalledWith(forged)
  })

  it('answers a preflight from a configured origin and withholds the origin from others', async () => {
    const serve = await loadServe(load, { APP_ALLOWED_ORIGINS: 'https://app.example' })
    const preflight = (origin: string) => serve(new Request('http://localhost/fn', { method: 'OPTIONS', headers: { Origin: origin } }))
    expect((await preflight('https://app.example')).headers.get('Access-Control-Allow-Origin')).toBe('https://app.example')
    expect((await preflight('https://evil.example')).headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
