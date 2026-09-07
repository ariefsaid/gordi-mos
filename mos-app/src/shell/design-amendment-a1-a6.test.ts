import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AC-024 (doc-grep) — #800's DESIGN.md amendments ship VERBATIM under § Components → Navigation.
 * DESIGN.md is the design-system source of truth, so the boundary's anatomy and the rail foot's
 * contents live there as owner-ratified prose, wrapped to the file's column — the grep asserts
 * the wording, unwrapped, not the line breaks.
 */
const DESIGN = readFileSync(resolve(process.cwd(), '..', 'DESIGN.md'), 'utf8')

/** § Components → Navigation, from its heading to the next section heading. */
function navigationSection(): string {
  const heading = DESIGN.indexOf('### Navigation')
  expect(heading, 'DESIGN.md has no § Components → Navigation heading').toBeGreaterThanOrEqual(0)
  const next = DESIGN.indexOf('\n### ', heading + 1)
  return DESIGN.slice(heading, next).replace(/\s+/g, ' ')
}

const A1 =
  '**Access boundary state.** A route the viewer is admitted to reach but not authorised to use ' +
  'renders, inside the shell frame, the page head with its title, the context-row sentence ' +
  '`Access required`, and one quiet dashed panel: `<Area> is outside your access` · one sentence ' +
  'stating that an admin changes access in Admin Settings · one outline `Back to Home`. It never ' +
  'redirects silently and never names data the viewer may not see. Navigation is unchanged: ' +
  'rendered links still equal admitted routes (OD-WAY-51); the boundary is what a typed or ' +
  'shared URL meets.'

const A6 =
  'Foot section (border-top) holds Admin Settings (admin only) and the identity chip; the ' +
  "chip's menu holds Personal Profile · Appearance · Sign out (OD-WAY-77)."

describe('AC-024: DESIGN.md carries the #800 navigation amendments verbatim', () => {
  it('A-1: § Navigation states the access boundary state, after the Mobile bullet', () => {
    const section = navigationSection()
    expect(section).toContain(A1)
    expect(section.indexOf('**Mobile:**')).toBeLessThan(section.indexOf('**Access boundary state.**'))
  })

  it('A-6: the Rail foot names Admin Settings and the identity chip, not "Settings"', () => {
    const section = navigationSection()
    expect(section).toContain(A6)
    expect(section).not.toContain('Foot section (border-top) holds Settings.')
  })
})
