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
