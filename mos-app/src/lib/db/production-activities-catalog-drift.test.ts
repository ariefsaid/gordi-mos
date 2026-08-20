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

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { PRODUCTION_ACTIVITIES } from './kitchen-logs.types'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const MIGRATIONS = join(REPO_ROOT, 'supabase', 'migrations')

/**
 * Every activity code the migration chain has INSERTed into shared.activities,
 * deduped and sorted — the catalog as the files define it, no database needed.
 * Comments are stripped first so prose about the catalog is never parsed as DDL.
 * A declared column list must be (code, name) — the code is the first literal of
 * each tuple — and any other shape fails LOUDLY here rather than quietly reading
 * the name column as a code.
 */
function catalogActivityCodes(): string[] {
  const codes: string[] = []
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    const body = readFileSync(join(MIGRATIONS, file), 'utf8')
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const statements = body.match(/\binsert\s+into\s+shared\.activities\b[^;]*;/gi) ?? []
    for (const stmt of statements) {
      const columns = /\binto\s+shared\.activities\s*\(([^)]*)\)/i.exec(stmt)?.[1]
      if (columns !== undefined) {
        const normalized = columns.split(',').map(c => c.trim().toLowerCase()).join(',')
        if (normalized !== 'code,name')
          throw new Error(`${file}: INSERT into shared.activities declares columns [${columns}] — teach this check that shape`)
      }
      const values = /\bvalues\b([\s\S]*)$/i.exec(stmt)?.[1] ?? ''
      for (const tuple of values.match(/'[^']*'\s*,\s*'[^']*'/g) ?? []) {
        const code = /^'([^']*)'/.exec(tuple)?.[1]
        if (code === undefined || code === '')
          throw new Error(`${file}: unparsable activity tuple ${tuple}`)
        codes.push(code)
      }
    }
  }
  return [...new Set(codes)].sort()
}

describe('PRODUCTION_ACTIVITIES is the shared.activities catalog — the fourth copy cannot drift (#392)', () => {
  it('the scan finds the catalog-defining INSERTs, so the equality below cannot pass vacuously', () => {
    expect(catalogActivityCodes().length).toBeGreaterThan(0)
  })

  it('equals the catalog exactly — no client-only activity (rejects nothing real), no catalog-only activity (offers nothing stale)', () => {
    expect([...PRODUCTION_ACTIVITIES].slice().sort()).toEqual(catalogActivityCodes())
  })
})
