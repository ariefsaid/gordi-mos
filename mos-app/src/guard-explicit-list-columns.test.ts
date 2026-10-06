import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// #1359: list reads in the non-fenced DAL project explicit columns — a `select('*')` here is a
// regression (Signals list reads and café list reads are fenced and excluded by design).
const DAL = ['weekly-updates', 'follow-ups', 'events', 'ops-log', 'processes', 'tasks', 'viewer']

describe('non-fenced DAL files project explicit columns, never * (#1359)', () => {
  it('holds no select(\'*\') in any of the seven files', () => {
    for (const name of DAL) {
      const src = readFileSync(resolve(__dirname, 'lib/db', `${name}.ts`), 'utf8')
      expect(src, `${name}.ts`).not.toMatch(/select\('\*'\)/)
    }
  })
})