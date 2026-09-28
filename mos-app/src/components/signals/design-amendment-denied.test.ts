import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AC-049 (doc-grep) — #775's DESIGN.md amendment ships verbatim: § Sanctioned empty-state
 * archetypes gains the Denied archetype (a viewer-inaccessible record renders `blank` + one
 * `Back`, never a retriable ErrorState). Mirrors the #770 doc-grep pattern
 * (design-amendment-p1-p2.test.ts) — a pinning test, not a rendering assertion.
 */
const DESIGN = readFileSync(resolve(process.cwd(), '..', 'DESIGN.md'), 'utf8')

function archetypesSection(): string {
  const heading = DESIGN.indexOf('### Sanctioned empty-state archetypes')
  expect(heading, 'DESIGN.md has no § Sanctioned empty-state archetypes heading').toBeGreaterThanOrEqual(0)
  const next = DESIGN.indexOf('\n### ', heading + 1)
  return DESIGN.slice(heading, next).replace(/\s+/g, ' ')
}

describe('AC-049: DESIGN.md carries the #775 Denied archetype', () => {
  it('states the blank + one Back rule, and that Retry never applies to a denied read', () => {
    const section = archetypesSection()
    expect(section).toContain('Denied')
    expect(section).toContain('one `Back`')
    expect(section).toContain('never `ErrorState`\'s Retry')
  })
})
