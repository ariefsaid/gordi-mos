import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AC-033 (doc-grep) — the #738 shell judgment's DESIGN.md amendment ships VERBATIM under
 * § Components → Overlays → Temporary search/command (audit A-9). DESIGN.md is the design-system
 * source of truth, so the palette's group contract lives there as owner-ratified prose, wrapped
 * to the file's column — the grep asserts the wording, unwrapped, not the line breaks.
 */
const DESIGN = readFileSync(resolve(process.cwd(), '..', 'DESIGN.md'), 'utf8')

const AMENDMENT =
  'Desktop palette contents: a search field over tasks, signals and people; **GO TO** listing ' +
  'destination roots only (≤6, never children at rest — children match by typed name); **ACT** ' +
  'with the three universal actions. Phone palette: search only — navigation is the tab bar, ' +
  'actions are the launcher.'

/** The Temporary search/command bullet's block: up to the next sibling bullet. */
function overlayBulletBlock(): string {
  const heading = DESIGN.indexOf('### Overlays')
  expect(heading, 'DESIGN.md has no § Components → Overlays heading').toBeGreaterThanOrEqual(0)
  const marker = DESIGN.indexOf('- **Temporary search/command:**', heading)
  expect(marker, 'Overlays no longer carries a Temporary search/command bullet').toBeGreaterThanOrEqual(0)
  const next = DESIGN.indexOf('\n- **', marker)
  return DESIGN.slice(marker, next)
}

describe('AC-033: DESIGN.md carries the #738 palette amendment verbatim (A-9)', () => {
  it('the Temporary search/command bullet states the desktop GO TO → ACT and phone search-only contract', () => {
    // Unwrap the file's line breaks: the amendment's words must be exact, its wrapping is typesetting.
    const block = overlayBulletBlock().replace(/\s+/g, ' ').trim()
    expect(block).toContain(AMENDMENT)
  })
})
