// F2 (OD-K-5 redesign plan §1/§8): the 32 WIP dishes in supabase/seed.sql must carry
// a non-null `category`. The column exists (migrations/20260620000001_ops_wip_items.sql)
// and the app already select('id,name,category') + renders item.category (Log row/card
// sub-label + the category filter). Seeding NULL left categories silently empty everywhere.
// This is a DATA invariant guard (pure fs-read, mirrors the RI-4 / C1 CSS guards) so the
// seed cannot silently regress to the (id, org_id, name) shape. Data-only: no migration,
// no app code change.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// seed.sql lives at the repo root (one level up from mos-app/, the vitest cwd).
const SEED = readFileSync(resolve(process.cwd(), '..', 'supabase', 'seed.sql'), 'utf8')

// Extract the single `insert into ops.wip_items … ;` statement.
function wipInsert(sql: string): string {
  const start = sql.indexOf('insert into ops.wip_items')
  expect(start, 'seed.sql must contain `insert into ops.wip_items`').toBeGreaterThan(-1)
  // the statement ends at the first `;` after the insert (the `on conflict … do nothing;`)
  const end = sql.indexOf(';', start)
  return sql.slice(start, end)
}

// Parse the `(col1, col2, …)` column list out of the INSERT header.
function columnList(stmt: string): string[] {
  const m = stmt.match(/\(([^)]+)\)\s*values/s)
  expect(m, 'INSERT must have a (cols) values … shape').not.toBeNull()
  return m![1].split(',').map(s => s.trim())
}

// Parse each value tuple line `  ('a', 'b', …),` into its trimmed single-quoted parts.
function valueTuples(stmt: string): string[][] {
  const tuples: string[][] = []
  // each value line begins with whitespace + `(` and ends with `)` + optional `,`
  for (const line of stmt.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('(')) continue
    // strip the wrapping ( … ) and trailing comma
    const inner = trimmed.replace(/^\(/, '').replace(/\)[,]?$/, '').trim()
    // split on `', '` to get the single-quoted fields, then strip quotes
    const fields = inner.split("',").map(f => f.trim().replace(/^'/, '').replace(/'$/, ''))
    tuples.push(fields)
  }
  return tuples
}

describe('F2: supabase/seed.sql wip_items carry a non-null category', () => {
  const stmt = wipInsert(SEED)
  const cols = columnList(stmt)
  const rows = valueTuples(stmt)

  it('the INSERT column list includes `category`', () => {
    expect(cols).toContain('category')
  })

  it('seeds all 32 WIP dishes (the real Gordi roster)', () => {
    expect(rows.length).toBe(32)
  })

  it('every row has a value for every column (no missing trailing category)', () => {
    rows.forEach((fields, i) => {
      expect(fields.length, `row ${i + 1} field count must match column count`).toBe(cols.length)
    })
  })

  it('every row carries a NON-empty category value', () => {
    const catIndex = cols.indexOf('category')
    rows.forEach((fields, i) => {
      const cat = fields[catIndex]
      expect(cat, `row ${i + 1} category must be a non-empty string`).toBeTruthy()
      expect(cat.trim().length).toBeGreaterThan(0)
    })
  })
})
