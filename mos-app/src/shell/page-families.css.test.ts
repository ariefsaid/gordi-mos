// #957 pin: DESIGN.md's Two-Measure Rule names Admin → People as a wide-operating-measure
// instance (a list-plus-panel master/detail surface, same test as the Work collections), and
// Admin → Teams/Access as NOT instances (single-column settings surfaces). This file's `:has()`
// selector is the one place that decision is enforced; jsdom cannot compute `:has()`, so this
// guard reads the sheet the same way the other css guards in this repo do.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'page-families.css'), 'utf8')

describe('page-families — Two-Measure Rule width selector (#957)', () => {
  it('widens the content frame for both the Work collections and Admin People', () => {
    expect(css).toMatch(
      /\.page-frame--v3 \.page-frame__content:has\(\.work-collection,\s*\.admin-people-collection\)\s*\{[^}]*max-width:\s*1760px;/s,
    )
  })

  it('does not widen the frame for a bare Admin Teams/Access marker (none is named here)', () => {
    expect(css).not.toMatch(/admin-teams-collection|admin-access-collection/)
  })
})
