/**
 * Census R2 DO-2 (objectives F1 P1) — catalog identity is never starved on phone.
 *
 * Finding: at 390px the row's flex-none Rename/Archive cluster shared the identity's line,
 * truncating names to ~8 characters ("Café HQ …", "Operational Excell…"). A row the user can
 * only recognize by its name must keep that name legible at every width (impeccable
 * ban-text-overflow; same fix shape as the home stream-row phone reflow).
 *
 * jsdom has no layout engine, so this pins the authored phone reflow: inside a phone
 * max-width block the identity takes the full row (flex-basis: 100%) and the name wraps
 * (white-space: normal) instead of nowrap-ellipsizing.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/catalog/catalog-collection.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Every top-level `@media` block in the file, each including its own body. */
const mediaBlocks = css.match(/@media[^{]*\{[\s\S]*?\n\}/g) ?? []

/** The body of the media block whose condition matches `condition`. */
function mediaBlock(condition: RegExp): string {
  const found = mediaBlocks.find((block) => condition.test(block.slice(0, block.indexOf('{'))))
  expect(found, `expected a @media block matching ${condition} in catalog-collection.css`).toBeDefined()
  return found!
}

/** The declarations of the FIRST rule for `selector` inside `source` — never the whole file. */
function ruleBody(source: string, selector: string): string {
  const idx = source.indexOf(selector)
  expect(idx, `expected ${selector} inside the block under test`).toBeGreaterThanOrEqual(0)
  const open = source.indexOf('{', idx)
  return source.slice(open + 1, source.indexOf('}', open))
}

/** The body of the max-width media block that contains the given selector. */
function phoneBlock(): string {
  const m = css.match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)
  expect(m, 'expected a phone max-width block in catalog-collection.css').not.toBeNull()
  const withIdentity = m!.find((block) => block.includes('.catalog-collection__identity'))
  expect(withIdentity, 'the phone block must reflow .catalog-collection__identity').toBeDefined()
  return withIdentity!
}

describe('shared catalog row actions stay usable on phone', () => {
  // #209's core criterion is the SWAP, and a swap is only real INSIDE the phone block: asserting
  // that the two class names appear somewhere in the file proved nothing — flipping the desktop
  // cluster to `display: flex` inside the media query left every case here green. So these read
  // the block's own body, the way the sibling DO-2 cases below already read theirs.
  it('swaps the inline cluster for the compact menu inside the phone viewport block', () => {
    const phone = mediaBlock(/max-width:\s*767\.98px/)
    expect(ruleBody(phone, '.catalog-collection__actions--desktop')).toMatch(/display:\s*none/)
    expect(ruleBody(phone, '.catalog-collection__actions--mobile')).toMatch(/display:\s*flex/)
    // …and the base file is the other half of the swap: the menu is hidden on wide rows.
    const base = css.slice(0, css.indexOf('@media'))
    expect(ruleBody(base, '.catalog-collection__actions--mobile')).toMatch(/display:\s*none/)
  })

  it('keeps a compact menu floor', () => {
    expect(ruleBody(mediaBlock(/max-width:\s*767\.98px/), '.catalog-collection__menu-trigger'))
      .toMatch(/min-width:\s*44px/)
    expect(css).toMatch(/\.catalog-collection__menu[\s\S]*?max-width:\s*calc\(100vw - 24px\)/)
    expect(css).not.toMatch(/\.catalog-collection__actions--mobile[^{]*\{[^}]*width:\s*100%/)
  })

  it('floats the row menu on the documented popover tier, not below sticky chrome', () => {
    // A local z-1/z-2 is only legitimate inside a component's own stacking context; this menu is
    // absolutely positioned in a `position: relative` parent that opens none, so a raw `2` put an
    // open row menu UNDER any --z-sticky (10) chrome floating over the list.
    expect(ruleBody(css, '.catalog-collection__menu')).toMatch(/z-index:\s*var\(--z-popover\)/)
  })
})

describe('a relation group nests its Tasks beneath it, never beside it', () => {
  it('the group row stacks while a leaf Task row stays inline', () => {
    // The generic `…relations-list li` is a flex ROW (link + count on one line). A GROUP row also
    // holds a nested <ul> of its Tasks, so it must override that to a column — otherwise the
    // nested list becomes a third column and, at 390px, one group's tasks render beside the next
    // group's name. jsdom has no layout engine, so this pins the authored rule.
    expect(css).toMatch(
      /\.catalog-collection__relations-list li\.catalog-collection__relations-group\s*\{[^}]*flex-direction:\s*column/,
    )
    expect(css).toMatch(/\.catalog-collection__relations-group-head\s*\{[^}]*display:\s*flex/)
    // …and the nested list is indented, so the nesting is visible and not just structural.
    expect(css).toMatch(
      /\.catalog-collection__relations-group\s*>\s*\.catalog-collection__relations-list\s*\{[^}]*padding-left/,
    )
  })
})

describe('DO-2: catalog rows keep their full name on phone', () => {
  it('the phone block gives the identity the full row', () => {
    const block = phoneBlock()
    const identity = block.slice(block.indexOf('.catalog-collection__identity'))
    expect(identity).toMatch(/flex-basis:\s*100%/)
  })

  it('the phone block lets the name wrap instead of nowrap-ellipsizing', () => {
    const block = phoneBlock()
    expect(block).toContain('.catalog-collection__name')
    const name = block.slice(block.indexOf('.catalog-collection__name'))
    expect(name).toMatch(/white-space:\s*normal/)
  })

  it('the base name rule still guards one-line overflow on wide rows', () => {
    // Outside the phone block the single-line ellipsis stays (wide rows have room).
    const base = css.slice(0, css.indexOf('@media'))
    const idx = base.indexOf('.catalog-collection__name')
    expect(idx).toBeGreaterThanOrEqual(0)
    const body = base.slice(base.indexOf('{', idx), base.indexOf('}', idx))
    expect(body).toMatch(/text-overflow:\s*ellipsis/)
  })
})
