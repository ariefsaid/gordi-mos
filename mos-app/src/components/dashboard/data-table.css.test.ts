import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/dashboard/data-table.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('DataTable phone-card titles', () => {
  it('wraps long no-space names instead of clipping them', () => {
    expect(css).toMatch(/\.dt-card-title\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })
})
