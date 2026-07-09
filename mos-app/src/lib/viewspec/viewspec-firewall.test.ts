// De-reference firewall — no sibling/upstream brand string, no service_role literal, in any
// ported artifact (AC-UV-019, CONTEXT.md Port posture). Static guard: walks viewspec/, the
// user-views DAL, and the dev harness page; asserts none of the forbidden literals appear.
// A human review (code-quality-reviewer) confirms no brand string leaks and that "Ported/
// Adapted from the sibling internal project" is the only provenance phrasing — writing the
// forbidden brand names here would itself be a leak, so this test only guards what MUST NOT
// appear (service_role literals + a known sibling-fixture UUID), not brand names.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = resolve(d, entry)
      const st = statSync(p)
      if (st.isDirectory()) {
        walk(p)
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
        files.push(p)
      }
    }
  }
  walk(dir)
  return files
}

const files = [
  ...collectSourceFiles(resolve(__dirname)), // viewspec/
  resolve(__dirname, '../db/user-views.ts'),
  resolve(__dirname, '../../pages/dev-views-page.tsx'),
]

// A known sibling-fixture UUID (a literal service-role placeholder id from the sibling
// port's test fixtures) — a bare substring check is fine for this one; it should never
// appear verbatim, comment or code.
const FORBIDDEN_LITERALS = ['00000000-0000-0000-0000-000000000001']

// service_role is legitimately NAMED in doc comments that assert its absence (NFR-UV-SEC-001's
// own header comments say "never service_role" / "Uses the caller-JWT client; never
// service_role" — the correct, intended documentation of the invariant). The firewall's real
// job is to catch actual USAGE (a bypass-RLS client), not the word appearing in prose that
// documents its absence. So this checks CODE lines only (comment lines — leading `//` or `*`,
// once trimmed — are skipped) for the service_role token.
const FORBIDDEN_CODE_PATTERNS = [/service_role/i]

function isCommentLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

describe('de-reference firewall — AC-UV-019', () => {
  it('walks a non-empty set of ported files (sanity — the walk itself must not silently find nothing)', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('no forbidden literal (a known sibling-fixture UUID) appears anywhere, comment or code', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const needle of FORBIDDEN_LITERALS) {
        expect(src, `${f} must not contain "${needle}"`).not.toContain(needle)
      }
    }
  })

  it('no service_role literal appears in executable code (doc comments documenting its absence are fine)', () => {
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n')
      for (const [i, line] of lines.entries()) {
        if (isCommentLine(line)) continue
        for (const pattern of FORBIDDEN_CODE_PATTERNS) {
          expect(pattern.test(line), `${f}:${i + 1} must not use service_role in code — "${line.trim()}"`).toBe(false)
        }
      }
    }
  })
})

// ── P2 extension (plan T31, D4) — walk the agent stack: supabase/functions/** + agent/**. The
// firewall now ALSO guards (a) provider brand names + hardcoded model ids in CODE (comments that
// document the neutral shape are fine, mirroring the service_role discipline above), and (b) the
// sharper service_role rule for the edge functions: the ONLY sanctioned usage is `auth.getUser` in
// the two index.ts files (FR-P2-DI-002). Brand names are base64-encoded here so this test file is
// not itself a leak (the self-leak hazard the header above warns about).
const REPO_ROOT = resolve(__dirname, '../../../../')
const FUNCTIONS_DIR = resolve(REPO_ROOT, 'supabase/functions')
const AGENT_DIR = resolve(__dirname, '../agent')

const agentStackFiles = [...collectSourceFiles(FUNCTIONS_DIR), ...collectSourceFiles(AGENT_DIR)]

// base64 of 'anthropic,openrouter,deepseek,claude,openai,gemini,mistral,llama' — decoded at runtime
// so the test file carries no plaintext brand name (the self-leak hazard).
const FORBIDDEN_BRANDS_B64 = 'YW50aHJvcGljLG9wZW5yb3V0ZXIsZGVlcHNlZWssY2xhdWRlLG9wZW5haSxnZW1pbmksbWlzdHJhbCxsbGFtYQ=='
const FORBIDDEN_BRANDS = Buffer.from(FORBIDDEN_BRANDS_B64, 'base64').toString('utf8').split(',')

// The two edge-function entry points are the ONLY files permitted to reference service_role in
// executable code — and only to build the verifier client that calls auth.getUser (FR-P2-DI-002).
const SERVICE_ROLE_EXEMPT = [
  resolve(FUNCTIONS_DIR, 'agent-chat/index.ts'),
  resolve(FUNCTIONS_DIR, 'compose-view/index.ts'),
]

describe('de-reference firewall — P2 agent stack (AC-P2-CF-002, D4, FR-P2-DI-002)', () => {
  it('walks a non-empty agent stack including BOTH edge-function index.ts entry points', () => {
    expect(agentStackFiles.length).toBeGreaterThan(10)
    for (const exempt of SERVICE_ROLE_EXEMPT) {
      expect(agentStackFiles, `expected ${exempt} in the walked set`).toContain(exempt)
    }
  })

  it('no provider brand name or model id appears in executable code (comments documenting neutrality are fine)', () => {
    for (const f of agentStackFiles) {
      const lines = readFileSync(f, 'utf8').split('\n')
      for (const [i, line] of lines.entries()) {
        if (isCommentLine(line)) continue
        const lower = line.toLowerCase()
        for (const brand of FORBIDDEN_BRANDS) {
          expect(
            lower.includes(brand),
            `${f}:${i + 1} must not reference brand "${brand}" in code — "${line.trim()}"`,
          ).toBe(false)
        }
      }
    }
  })

  it('no sibling-fixture UUID appears anywhere in the agent stack, comment or code', () => {
    for (const f of agentStackFiles) {
      const src = readFileSync(f, 'utf8')
      for (const needle of FORBIDDEN_LITERALS) {
        expect(src, `${f} must not contain "${needle}"`).not.toContain(needle)
      }
    }
  })

  it('service_role appears in executable code ONLY in the two index.ts entry points (the auth.getUser exemption)', () => {
    for (const f of agentStackFiles) {
      const exempt = SERVICE_ROLE_EXEMPT.includes(f)
      const lines = readFileSync(f, 'utf8').split('\n')
      for (const [i, line] of lines.entries()) {
        if (isCommentLine(line)) continue
        if (!/service_role/i.test(line)) continue
        // A non-exempt file using service_role in code is a bypass-RLS leak (FR-P2-DI-001/002).
        expect(
          exempt,
          `${f}:${i + 1} uses service_role in code but is not an exempt index.ts — "${line.trim()}"`,
        ).toBe(true)
      }
    }
  })

  it('each exempt index.ts actually calls auth.getUser (service_role is for JWT verify, never business data)', () => {
    for (const f of SERVICE_ROLE_EXEMPT) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} must call auth.getUser to justify its service_role use`).toContain('.auth.getUser(')
    }
  })
})
