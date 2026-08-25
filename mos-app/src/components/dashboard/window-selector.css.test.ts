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

/** Declarations that ARE the shared grammar — none may be re-declared for the track locally. */
const GRAMMAR = ['height: 32px', 'padding: 3px', 'background: var(--secondary)', 'gap: 4px']

describe('GUARD #283: WindowSelector imports the segmented-track grammar', () => {
  it('imports the shared file', () => {
    expect(selector).toContain("@import '../../styles/segmented-track.css'")
  })

  it('the shared file actually covers WindowSelector’s class family', () => {
    // If the import is present but the shared file never mentions these selectors, the control
    // renders unstyled — an import alone is not inheritance.
    expect(shared).toContain('.window-selector-seg')
    expect(shared).toContain('.window-selector-tab')
  })

  it('does not re-author the track grammar for .window-selector-seg', () => {
    // Everything before the custom date-pair section is the seg surface's own area; the chip
    // below it legitimately has its own height/border/background.
    const segArea = selector.slice(0, selector.indexOf('/* Custom date-pair'))
    const reAuthored = GRAMMAR.filter((d) => segArea.includes(d))
    expect(reAuthored, `re-authored in window-selector.css instead of inherited: ${reAuthored.join(', ')}`).toEqual([])
  })

  it('keeps only its own concerns — the per-option phone floor stays local', () => {
    expect(selector).toContain('min-width: 44px')
  })
})
