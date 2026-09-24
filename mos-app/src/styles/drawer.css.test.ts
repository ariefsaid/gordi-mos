import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const drawerCss = readFileSync(resolve(process.cwd(), 'src/styles/drawer.css'), 'utf8')
const recordPanelCss = readFileSync(resolve(process.cwd(), 'src/shell/record-panel-host.css'), 'utf8')
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

/** Return the declaration block body for the first rule whose selector line contains `selector`. */
function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find selector ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated rule: ${selector}`)
}

/** Every rule (any nesting depth) in the overlay sheets that sets `position`, with its value. */
function positionRules(css: string): { selector: string; value: string }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: { selector: string; value: string }[] = []
  for (const [, selector, body] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const value = body.match(/(?:^|;)\s*position:\s*([a-z-]+)/)?.[1]
    if (value) rules.push({ selector: selector.trim(), value })
  }
  return rules
}

/** Position values of every overlay-sheet rule matching an aside with `className`. */
function positionsFor(className: string): { selector: string; value: string }[] {
  const aside = document.createElement('aside')
  aside.className = className
  return [...positionRules(drawerCss), ...positionRules(recordPanelCss)].filter(({ selector }) => {
    try { return aside.matches(selector) } catch { return false }
  })
}

// TB-1 / OD-P4-9 — the shell-mounted overlay panels (Inbox quick-triage on `.drawer-shell-split`,
// standalone Deputy on `.overlay-companion-host--standalone`) float over MAIN content, so they must
// NOT cover the in-flow top-bar chrome (the bell/deputy/⌘K cluster, incl. the control that opened
// the panel). Both anchor at `top: var(--header-h)`, never `top: 0`.
describe('TB-1: shell overlay panels leave the top-bar chrome reachable', () => {
  it('.drawer-shell-split anchors below the header, not at top:0', () => {
    const body = ruleBody(drawerCss, '.drawer-shell-split {')
    expect(body).toMatch(/top:\s*var\(--header-h\)/)
    expect(body).not.toMatch(/(?<!-)top:\s*0\b/)
  })

  it('.overlay-companion-host--standalone anchors below the header, not at top:0', () => {
    const body = ruleBody(drawerCss, '.drawer.overlay-companion-host--standalone {')
    expect(body).toMatch(/top:\s*var\(--header-h\)/)
    expect(body).not.toMatch(/(?<!-)top:\s*0\b/)
  })

  it('the in-flow split stacking context cannot override shell-panel fixed positioning', () => {
    const matching = positionsFor('drawer drawer-split drawer-shell-split')
    expect(matching.length).toBeGreaterThan(0)
    expect(matching).toEqual(matching.map((rule) => ({ ...rule, value: 'fixed' })))
  })
})

// ── The record width (#190) ──────────────────────────────────────────────────────────────────
//
// EVERY CASE HERE PINS THE DECLARATION, NOT THE RENDERED WIDTH. jsdom computes no layout, so it
// cannot tell you what `clamp(360px, 45vw, 520px)` resolves to at 768px; only a browser can. The
// arithmetic below is done in the test, from the declaration's own numbers, and is a check on the
// VALUES AS WRITTEN. A real 768px look is still owed and is stated as owed in the PR.
//
// This exists because the width was lost once, silently. These rules were moved here out of
// `TasksWorkspace.css` (they had to be — a shell-mounted RecordPanelHost got no skin from a
// route-scoped stylesheet), and the move took v4's `min(45vw, 520px)`, which has NO lower bound,
// over this line's `clamp(360px, 50vw, 520px)`. Nothing was asserting width, so nothing went red.
describe('the record sheet keeps its floor (#190, #930)', () => {
  /** The floor of --record-panel-w (index.css) — the app's ONE stated record width floor,
   *  shared by .record-split, .drawer-shell-split, Tasks' .split and this modal sheet. */
  function splitTrackFloorPx(): number {
    const match = indexCss.match(/--record-panel-w:\s*clamp\(\s*(\d+)px\s*,/)
    expect(match, 'index.css no longer declares --record-panel-w: clamp(<px>, …)').not.toBeNull()
    return Number(match![1])
  }

  /** The three numbers of the modal sheet's `clamp(<floor>, <preferred>, <cap>)`. */
  function sheetClamp(): { floorPx: number; preferredVw: number; capPx: number } {
    const body = ruleBody(drawerCss, '.drawer-modal.drawer-sheet {')
    const match = body.match(/width:\s*clamp\(\s*(\d+)px\s*,\s*(\d+)vw\s*,\s*(\d+)px\s*\)/)
    expect(
      match,
      'the modal sheet no longer declares width: clamp(<px>, <vw>, <px>) — a bare min()/max() has no floor',
    ).not.toBeNull()
    return { floorPx: Number(match![1]), preferredVw: Number(match![2]), capPx: Number(match![3]) }
  }

  it('declares a floor equal to the split track minimum — derived, not a repeated literal', () => {
    // Derived from `.record-split` on purpose: repeating `360` here would let the two drift apart
    // and still pass, which is the same class of failure as having no assertion at all.
    expect(sheetClamp().floorPx).toBe(splitTrackFloorPx())
  })

  it('the declared floor beats the preferred width across the whole band the rule governs', () => {
    // The sheet regime runs 768–1099px (below 768 the phone rule takes over; at 1100 the non-modal
    // split does). Arithmetic on the DECLARED numbers: at the bottom of that band the percentage
    // term is what a missing floor would hand the viewer.
    const { floorPx, preferredVw } = sheetClamp()
    const atBandBottom = (768 * preferredVw) / 100
    expect(atBandBottom).toBeLessThan(floorPx) // 345.6 < 360 — the floor is what applies
    expect(Math.max(atBandBottom, floorPx)).toBe(floorPx)
  })

  it('keeps the cap and stays in bounds on a viewport narrower than the floor', () => {
    const { capPx } = sheetClamp()
    expect(capPx).toBe(520)
    // max-width:100% is what stops the floor from overflowing a <360px viewport.
    expect(ruleBody(drawerCss, '.drawer-modal.drawer-sheet {')).toMatch(/max-width:\s*100%/)
  })

  it('the phone rule still wins below 768px — the floor never applies where it would overflow', () => {
    expect(drawerCss).toMatch(
      /@media \(max-width: 767\.98px\)\s*\{\s*\.drawer-modal\.drawer-sheet\s*\{[^}]*width:\s*auto/s,
    )
  })
})

// ── The overlay z-tier (#190) ────────────────────────────────────────────────────────────────
//
// The other value that changed when these rules moved, and unlike the width this one is a
// deliberate correction rather than a regression: `TasksWorkspace.css` had a raw `z-index: 90`,
// which put the drawer ABOVE the ⌘K palette (`z-index: 50`) and above the confirm tier — the
// confirm-behind-drawer bug. The ladder in index.css states the intended order in its own comment
// (`--z-modal: 40 … ABOVE any drawer`), so the drawer takes `--z-drawer` and a confirm launched
// from inside a drawer is reachable. Pinned so the raw number cannot come back.
describe('the overlay root sits on the z-index ladder, not a raw number (#190)', () => {
  it('.drawer-modal-root uses var(--z-drawer)', () => {
    const body = ruleBody(drawerCss, '.drawer-modal-root {')
    expect(body).toMatch(/z-index:\s*var\(--z-drawer\)/)
    expect(body).not.toMatch(/z-index:\s*\d/)
  })

  it('--z-drawer really is below the modal tier a confirm uses', () => {
    // Without this the case above would pass just as well with the ladder inverted.
    const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    const drawerTier = Number(indexCss.match(/--z-drawer:\s*(\d+)/)![1])
    const modalTier = Number(indexCss.match(/--z-modal:\s*(\d+)/)![1])
    expect(drawerTier).toBeLessThan(modalTier)
  })
})

// ── Deputy's position does not depend on stylesheet order ────────────────────────────────────
//
// The desktop companion aside carries `drawer drawer-split overlay-companion-host …`. Two
// equal-specificity rules setting `position` on it are decided by which file the bundle loads
// last, which jsdom cannot see. So the contract is: every rule in the shared overlay sheets that
// matches the companion aside and sets `position` sets `fixed` — no competitor exists to win.
describe('the desktop Deputy companion has exactly one position, independent of CSS order', () => {
  for (const layout of ['standalone', 'with-record']) {
    it(`every position rule matching the ${layout} companion says fixed`, () => {
      const matching = positionsFor(`drawer drawer-split overlay-companion-host overlay-companion-host--${layout}`)
      expect(matching.length).toBeGreaterThan(0)
      expect(matching).toEqual(matching.map((rule) => ({ ...rule, value: 'fixed' })))
    })
  }

  it('the in-flow record aside still gets its own stacking context', () => {
    expect(positionsFor('drawer drawer-split').map(({ value }) => value)).toEqual(['relative'])
  })
})
