import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GUARD #283 — WindowSelector must INHERIT the `seg` grammar, never re-author it.
 *
 * WindowSelector (Money's 7d/30d/60d/Custom) renders immediately beside CutToggle's
 * Branch/Activity tabs on the same toolbar. It used to carry its own pixel-for-pixel copy
 * of the track — same 32px height, same `--secondary`, same 3px padding, same inner
 * corner, same lift — so a change to one drifted from the other in the same glance. That
 * adjacency is why styles/segmented-track.css exists.
 *
 * These assertions fail if the copy comes back.
 */
const dir = join(__dirname)
const selector = readFileSync(join(dir, 'window-selector.css'), 'utf8')
const shared = readFileSync(join(dir, '..', '..', 'styles', 'segmented-track.css'), 'utf8')

/** Declarations that ARE the shared grammar — none may be re-declared for the track locally.
 *  Whitespace-insensitive, and it includes the two DESIGN.md singles out as the drift risk
 *  (the nested inner corner and the lift), not just the obvious four. */
const GRAMMAR: Array<[string, RegExp]> = [
  ['height: 32px', /height:\s*32px/],
  ['padding: 3px', /padding:\s*3px(\s|;|})/],
  ['background: var(--secondary)', /background:\s*var\(\s*--secondary\s*\)/],
  ['gap: 4px', /gap:\s*4px/],
  ['border-radius: calc(var(--radius-sm) - 2px)', /border-radius:\s*calc\(\s*var\(\s*--radius-sm\s*\)\s*-\s*2px\s*\)/],
  ['the 0 1px 2px lift', /box-shadow:\s*0\s+1px\s+2px/],
]

/** The date-pair chip legitimately has its own height/border/background. Everything else in the
 *  file is the seg surface's area. Anchoring on a comment that could be renamed would let the
 *  guard pass vacuously, so its absence is an explicit failure, not a silent rescope. */
const CHIP_MARKER = '/* Custom date-pair'
function segArea(): string {
  const at = selector.indexOf(CHIP_MARKER)
  if (at === -1) {
    throw new Error(
      `window-selector.css no longer contains "${CHIP_MARKER}". This guard slices there to skip ` +
        'the chip; without it the scan would be meaningless. Re-anchor it deliberately.',
    )
  }
  return selector.slice(0, at)
}

describe('GUARD #283: WindowSelector imports the segmented-track grammar', () => {
  it('imports the shared file', () => {
    expect(selector).toContain("@import '../../styles/segmented-track.css'")
  })

  it('the shared file actually covers WindowSelector\u2019s class family', () => {
    // An import alone is not inheritance: if the shared file never names these selectors the
    // control renders unstyled.
    expect(shared).toContain('.window-selector-seg')
    expect(shared).toContain('.window-selector-tab')
  })

  it('does not re-author the track grammar for .window-selector-seg', () => {
    const area = segArea()
    const reAuthored = GRAMMAR.filter(([, re]) => re.test(area)).map(([label]) => label)
    expect(reAuthored, `re-authored instead of inherited: ${reAuthored.join(', ')}`).toEqual([])
  })

  it('the chip marker exists, so the scan above is never vacuous', () => {
    expect(() => segArea()).not.toThrow()
    expect(segArea().length).toBeGreaterThan(200)
  })

  it('keeps its own concerns — the per-option floor stays local AND unconditional', () => {
    // Pre-fold this was not inside a media query; scoping it to phone would narrow the desktop
    // presets, which is a metric change, not an extraction (#283 review).
    const beforeMedia = selector.slice(0, selector.indexOf('@media'))
    expect(beforeMedia).toContain('min-width: 44px')
  })
})
