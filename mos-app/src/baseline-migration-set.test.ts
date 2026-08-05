import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * OWNS: AC-015 — the migration directory holds ONE domain-ordered set and no file from either
 *                prior chain.
 *       AC-014 (the file half) — no test file has been quietly emptied or skipped rather than
 *                failed, which is the only shape a *silent* deferral could take under OD-WAY-37.
 *
 * Why these live at the unit layer rather than in pgTAP. Both are properties of the DIRECTORY, and
 * pgTAP can only see what was handed to psql — a stale file that the runner skipped, or a suite
 * trimmed to `plan(0)`, is invisible from inside the database. baseline_01_migration_set.sql owns
 * the complementary half (what actually applied, and in what domain order) because that lives in
 * the ledger.
 *
 * AC-015 was true in fact when #186 shipped and had no owner at all: nothing stopped a file with a
 * pre-squash prefix reappearing, and the failure would be silent because such a file applies
 * perfectly well — it just quietly reintroduces the two-chain history the squash removed.
 */
const REPO_ROOT = join(__dirname, '..', '..')
const MIGRATIONS = join(REPO_ROOT, 'supabase', 'migrations')
const TESTS = join(REPO_ROOT, 'supabase', 'tests')

/** The squashed baseline's single prefix (OD-WAY-35). Every migration carries it; nothing else may. */
const BASELINE_PREFIX = /^20260805\d{6}_/

/** Domain order is the content of the ruling, not an alphabetical accident. */
const DOMAINS = ['shared', 'mos', 'ops', 'integrations', 'reporting'] as const

const migrations = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()

describe('AC-015 — one domain-ordered migration set', () => {
  it('every migration carries the baseline prefix, so no file from either prior chain survives', () => {
    const strays = migrations().filter((f) => !BASELINE_PREFIX.test(f))
    expect(strays).toEqual([])
  })

  it('holds nothing but .sql — a parked or renamed migration is not a way to keep one around', () => {
    const nonSql = readdirSync(MIGRATIONS).filter((f) => !f.endsWith('.sql'))
    expect(nonSql).toEqual([])
  })

  it('groups into the five domains in order, with no interleaving', () => {
    const seen = migrations().map((f) => {
      const domain = DOMAINS.find((d) => f.replace(BASELINE_PREFIX, '').startsWith(`${d}_`))
      expect(domain, `${f} belongs to no domain`).toBeDefined()
      return domain
    })
    // Collapse runs, then assert the sequence of runs IS the domain order. A domain appearing
    // twice collapses to two entries and fails, which is exactly the interleaving being ruled out.
    const runs = seen.filter((d, i) => d !== seen[i - 1])
    expect(runs).toEqual([...DOMAINS])
  })
})

describe('AC-014 — a deferral is never silent', () => {
  const testFiles = readdirSync(TESTS).filter((f) => f.endsWith('.sql'))

  it('has test files at all, so the two assertions below cannot pass vacuously', () => {
    expect(testFiles.length).toBeGreaterThan(0)
  })

  it('declares a non-zero plan in every file — an emptied suite still reports ok', () => {
    const empty = testFiles.filter((f) => {
      const body = readFileSync(join(TESTS, f), 'utf8')
      const plan = /select\s+plan\(\s*(\d+)\s*\)/i.exec(body)
      return !plan || Number(plan[1]) === 0
    })
    expect(empty).toEqual([])
  })

  it('uses no SKIP directive — OD-WAY-37 wants a named test with a linked issue, not a skipped one', () => {
    // Line comments are stripped first, deliberately. The prose in these files discusses skipping
    // and exemptions constantly — "skip the SPA", "the null-org seed path stays exempt" — and a
    // matcher that reads comments flags the writing rather than the behaviour. Only pgTAP's actual
    // directives count: `select skip(...)`, `skip_all`, and the TAP `# SKIP` marker.
    const skipped = testFiles.filter((f) => {
      const body = readFileSync(join(TESTS, f), 'utf8').replace(/--[^\n]*/g, '')
      return /\bselect\s+skip\s*\(|\bskip_all\b|#\s*SKIP\b/i.test(body)
    })
    expect(skipped).toEqual([])
  })
})
