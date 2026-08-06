import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'

const SRC = join(__dirname, '..')

// This registry started empty on `dev` (no page rendered `PageFamilyFrame` yet) and every existing
// `context-row.test.tsx` case exercises it through a MOCK, never the real export — so before this
// file, nothing proved the real array's content once a surface actually populated it. #191 is that
// first surface: it must both render `PageFamilyFrame` (home-page.tsx) AND register itself here, or
// ContextRow renders a duplicate orientation signal alongside Home's own status row (Experience-
// Contract Rule 1). This is the direct check on the real, unmocked registry.
describe('PAGE_FAMILY_FRAME_ROUTES (#191)', () => {
  it('registers Home (`/`) on the workspace family', () => {
    const home = PAGE_FAMILY_FRAME_ROUTES.find((r) => r.path === '/')
    expect(home, 'Home must be registered or ContextRow will render a second orientation signal')
      .toBeDefined()
    expect(home?.family).toBe('workspace')
    expect(home?.symbol).toBe('HomePage')
  })
})

/**
 * #270 — the check that was missing. The registry drifted from reality for the entire v4 port:
 * nineteen surfaces moved onto `PageFamilyFrame` and none added its row, so the list stood at
 * five while ContextRow kept printing the job sentence a second time above a page head that
 * already carried it — and cost 40px of content height on every route but Home.
 *
 * A missing entry and a wrong entry fail in opposite directions (duplicate sentence / silence
 * with nothing filling the gap), so both are checked, against the source files themselves rather
 * than a mock.
 */
describe('issue 270 — the registry describes the pages that really render the frame', () => {
  it.each(PAGE_FAMILY_FRAME_ROUTES.map((e) => [e.path, e.sourceFile, e.symbol] as const))(
    '%s — %s exports %s and renders the frame',
    (_path, sourceFile, symbol) => {
      const full = join(SRC, sourceFile)
      expect(existsSync(full), `${sourceFile} does not exist`).toBe(true)
      const src = readFileSync(full, 'utf8')
      // The symbol must be exported by the file the entry names — an entry pointing at a
      // component that moved is how this list rotted in the first place.
      expect(src, `${sourceFile} does not export ${symbol}`).toMatch(
        new RegExp(`export\\s+(function|const)\\s+${symbol}\\b`),
      )
      // And the file must genuinely render the frame: that is the claim the entry makes, and
      // without it ContextRow falls silent with nothing replacing the sentence.
      expect(src, `${sourceFile} renders no PageFamilyFrame`).toContain('PageFamilyFrame')
    },
  )

  it('follow-ups is deliberately excluded — that page renders no frame yet', () => {
    // The one place this branch's registry departs from v4's, guarded in both directions. If this
    // fails because follow-ups GAINED a frame, add its two routes and delete this case — that is
    // the cutover, and it should be a deliberate edit rather than a silent drift.
    const src = readFileSync(join(SRC, 'pages/follow-ups-page.tsx'), 'utf8')
    expect(src).not.toContain('PageFamilyFrame')
    const paths = PAGE_FAMILY_FRAME_ROUTES.map((e) => e.path)
    expect(paths).not.toContain('/money/follow-ups')
    expect(paths).not.toContain('/work/follow-ups/:id')
  })

  it('no path is registered twice', () => {
    const paths = PAGE_FAMILY_FRAME_ROUTES.map((e) => e.path)
    expect(paths).toEqual([...new Set(paths)])
  })
})
