import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AC-044 (doc-grep) — #756's DESIGN.md amendment ships VERBATIM under
 * § Sanctioned empty-state archetypes (audit A7). DESIGN.md is the design-system source of
 * truth, so the "empty relation renders its derived state word" rule lives there as
 * owner-ratified prose — the grep asserts the wording, unwrapped, not the line breaks.
 *
 * The record renders "Ad hoc" instead of an em dash on a missing optional relation
 * (Project/Process, Objective) — the same fossil the record adapter's AC-038 tests pin. This
 * doc guard prevents A7 from silently disappearing from the design system while the code
 * keeps rendering the state word.
 */
const DESIGN = readFileSync(resolve(process.cwd(), '..', 'DESIGN.md'), 'utf8')

const AMENDMENT =
  '**Empty relation.** A missing optional relation renders its derived state word ("Ad hoc"), never "—".'

/** The Sanctioned empty-state archetypes section body — up to the next H2 or H3. */
function emptyStateSection(): string {
  const heading = DESIGN.indexOf('### Sanctioned empty-state archetypes')
  expect(heading, 'DESIGN.md has no § Sanctioned empty-state archetypes heading').toBeGreaterThanOrEqual(0)
  const nextHeading = Math.min(
    ...['\n## ', '\n### '].map((sep) => {
      const idx = DESIGN.indexOf(sep, heading + 1)
      return idx < 0 ? DESIGN.length : idx
    }),
  )
  return DESIGN.slice(heading, nextHeading)
}

describe('AC-044: DESIGN.md carries the #756 empty-state amendment verbatim (A7)', () => {
  it('the Sanctioned empty-state archetypes section states the "Empty relation" rule', () => {
    // Unwrap the file's line breaks: the amendment's words must be exact, its wrapping is typesetting.
    const block = emptyStateSection().replace(/\s+/g, ' ').trim()
    expect(block).toContain(AMENDMENT)
  })
})
