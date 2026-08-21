// The fourth Activity vocabulary copy, guarded (#392). shared.activities is the one
// database definition since #215 (20260814000001); the client's PRODUCTION_ACTIVITIES
// is deliberately still a compile-time literal, because the vocabulary changes by
// migration, never by session. What was missing is the seam: nothing failed when the
// two drifted, so a catalog activity the client did not know about was SILENTLY
// dropped — from a default stream (default-stream.ts), from the enumerable stream
// catalog (streamCatalogFrom), and from every picker. This test owns that seam.
//
// OWNS: AC-2 — drift between shared.activities and PRODUCTION_ACTIVITIES fails here,
//                in CI, instead of in a person's silently missing default stream.
//       AC-1/AC-4 — the equality is bidirectional: the client rejects nothing the
//                catalog really holds (no more silent default-stream drop), and the
//                pickers offer nothing stale.
//
// Layer: unit (Vitest reading the migration directory), not pgTAP — pgTAP can only see
// the applied database, never the TypeScript constant. Same pattern
// baseline-migration-set.test.ts established for directory-owned facts. The catalog is
// migration-owned by design (no session write path), so the files ARE the definition;
// supabase/seed.sql seeds teams FROM the catalog and adds no activity of its own.

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PRODUCTION_ACTIVITIES } from './kitchen-logs.types'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const MIGRATIONS = join(REPO_ROOT, 'supabase', 'migrations')

/**
 * Every statement that can change what shared.activities holds. Deliberately wider than
 * the one shape this scan can read: INSERT is not the only way the catalog moves — the
 * catalog's own migration names delete as a legitimate migration-owned path, and UPDATE
 * or TRUNCATE would move it too. Matching them all is what lets the scan REFUSE the ones
 * it cannot read instead of scoring them as "no activities here".
 *
 * `cross join shared.activities` and other reads are not matched: the verb must govern
 * the table directly.
 */
const CATALOG_WRITE =
  /\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?shared\.activities\b[^;]*;/gi

/**
 * Every activity code the migration chain has INSERTed into shared.activities,
 * deduped and sorted — the catalog as the files define it, no database needed.
 * Comments are stripped first so prose about the catalog is never parsed as DDL.
 *
 * This reads exactly ONE shape: `insert into shared.activities (code, name) values …`.
 * Every other way of writing a catalog change — INSERT … SELECT, DELETE, UPDATE,
 * TRUNCATE, an undeclared column list — throws instead of contributing nothing. A scan
 * that silently understood a subset would let the catalog and the client drift with this
 * guard still green, which is the one failure it exists to catch; refusing is loud, and
 * the fix is to teach the scan the new shape in the same PR that introduces it.
 */
function catalogActivityCodes(migrationsDir: string = MIGRATIONS): string[] {
  const codes: string[] = []
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    const body = readFileSync(join(migrationsDir, file), 'utf8')
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    for (const stmt of body.match(CATALOG_WRITE) ?? []) {
      // Annotated, not inferred: TypeScript only narrows past a `never`-returning arrow
      // when the binding itself declares the type.
      const refuse: (why: string) => never = why => {
        throw new Error(
          `${file}: ${why} — this check reads only \`insert into shared.activities (code, name) values …\`, ` +
            `so it cannot tell what this leaves in the catalog. Teach it that shape: ${stmt.replace(/\s+/g, ' ').trim()}`,
        )
      }
      if (!/^\s*insert/i.test(stmt))
        refuse('a non-INSERT statement writes shared.activities')
      const columns = /\binto\s+shared\.activities\s*\(([^)]*)\)/i.exec(stmt)?.[1]
      if (columns === undefined)
        refuse('INSERT into shared.activities declares no column list')
      const normalized = columns.split(',').map(c => c.trim().toLowerCase()).join(',')
      if (normalized !== 'code,name')
        refuse(`INSERT into shared.activities declares columns [${columns}]`)
      const values = /\bvalues\b([\s\S]*)$/i.exec(stmt)?.[1]
      if (values === undefined)
        refuse('INSERT into shared.activities has no VALUES clause (an INSERT … SELECT?)')
      const tuples = values.match(/'[^']*'\s*,\s*'[^']*'/g) ?? []
      if (tuples.length === 0)
        refuse('INSERT into shared.activities VALUES yielded no (code, name) tuple')
      for (const tuple of tuples) {
        const code = /^'([^']*)'/.exec(tuple)?.[1]
        if (code === undefined || code === '')
          refuse(`unparsable activity tuple ${tuple}`)
        codes.push(code)
      }
    }
  }
  return [...new Set(codes)].sort()
}

/** A throwaway migrations directory holding exactly the statements under test. */
function migrationsContaining(...statements: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'activities-scan-'))
  statements.forEach((sql, i) =>
    writeFileSync(join(dir, `2999010100000${i}_probe.sql`), `-- probe\n${sql}\n`),
  )
  return dir
}

describe('PRODUCTION_ACTIVITIES is the shared.activities catalog — the fourth copy cannot drift (#392)', () => {
  it('the scan finds the catalog-defining INSERTs, so the equality below cannot pass vacuously', () => {
    expect(catalogActivityCodes().length).toBeGreaterThan(0)
  })

  it('equals the catalog exactly — no client-only activity (rejects nothing real), no catalog-only activity (offers nothing stale)', () => {
    expect([...PRODUCTION_ACTIVITIES].slice().sort()).toEqual(catalogActivityCodes())
  })
})

describe('the scan refuses every catalog change it cannot read, instead of scoring it as no change (#415)', () => {
  it('reads the VALUES form it does understand', () => {
    const dir = migrationsContaining(
      "insert into shared.activities (code, name) values ('kitchen', 'Kitchen'), ('bar', 'Bar');",
    )
    expect(catalogActivityCodes(dir)).toEqual(['bar', 'kitchen'])
  })

  it('refuses an INSERT … SELECT, which would otherwise add an activity the scan never sees', () => {
    const dir = migrationsContaining(
      "insert into shared.activities (code, name) select 'prep', 'Prep' " +
        "where not exists (select 1 from shared.activities where code = 'prep');",
    )
    expect(() => catalogActivityCodes(dir)).toThrow(/no VALUES clause/)
  })

  it('refuses a DELETE, which shrinks the catalog the migration comment says it may shrink', () => {
    const dir = migrationsContaining("delete from shared.activities where code = 'bar';")
    expect(() => catalogActivityCodes(dir)).toThrow(/non-INSERT statement/)
  })

  it('refuses an UPDATE that renames a code', () => {
    const dir = migrationsContaining("update shared.activities set code = 'bar_service' where code = 'bar';")
    expect(() => catalogActivityCodes(dir)).toThrow(/non-INSERT statement/)
  })

  it('refuses a TRUNCATE', () => {
    const dir = migrationsContaining('truncate table shared.activities;')
    expect(() => catalogActivityCodes(dir)).toThrow(/non-INSERT statement/)
  })

  it('refuses an INSERT with no declared column list, whose tuple order it cannot know', () => {
    const dir = migrationsContaining("insert into shared.activities values ('prep', 'Prep', now());")
    expect(() => catalogActivityCodes(dir)).toThrow(/declares no column list/)
  })

  it('still refuses a declared column list in the wrong shape', () => {
    const dir = migrationsContaining("insert into shared.activities (name, code) values ('Prep', 'prep');")
    expect(() => catalogActivityCodes(dir)).toThrow(/declares columns \[name, code\]/)
  })

  it('reads shared.activities as a JOIN source without treating it as a catalog write', () => {
    const dir = migrationsContaining(
      'insert into shared.stream_teams (branch_id, activity)\n' +
        '  select b.id, a.code from shared.branches b cross join shared.activities a;',
    )
    expect(catalogActivityCodes(dir)).toEqual([])
  })
})
