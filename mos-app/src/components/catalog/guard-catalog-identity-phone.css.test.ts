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

/** The body of the max-width media block that contains the given selector. */
function phoneBlock(): string {
  const m = css.match(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)
  expect(m, 'expected a phone max-width block in catalog-collection.css').not.toBeNull()
  const withIdentity = m!.find((block) => block.includes('.catalog-collection__identity'))
  expect(withIdentity, 'the phone block must reflow .catalog-collection__identity').toBeDefined()
  return withIdentity!
}

describe('shared catalog row actions stay usable on phone', () => {
  it('uses the viewport phone branch and compact menu floor', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)/)
    expect(css).toContain('.catalog-collection__actions--desktop')
    expect(css).toContain('.catalog-collection__actions--mobile')
    expect(css).toMatch(/\.catalog-collection__menu-trigger[\s\S]*?min-width:\s*44px/)
    expect(css).toMatch(/\.catalog-collection__menu[\s\S]*?max-width:\s*calc\(100vw - 24px\)/)
    expect(css).not.toMatch(/\.catalog-collection__actions--mobile[^{]*\{[^}]*width:\s*100%/)
  })
})

describe('a relation branch nests its Tasks beneath it, never beside it', () => {
  it('the branch row stacks while a leaf Task row stays inline', () => {
    // The generic `…relations-list li` is a flex ROW (link + count on one line). A BRANCH row also
    // holds a nested <ul> of its Tasks, so it must override that to a column — otherwise the
    // nested list becomes a third column and, at 390px, one branch's tasks render beside the next
    // branch's name. jsdom has no layout engine, so this pins the authored rule.
    expect(css).toMatch(
      /\.catalog-collection__relations-list li\.catalog-collection__relations-branch\s*\{[^}]*flex-direction:\s*column/,
    )
    expect(css).toMatch(/\.catalog-collection__relations-branch-head\s*\{[^}]*display:\s*flex/)
    // …and the nested list is indented, so the nesting is visible and not just structural.
    expect(css).toMatch(
      /\.catalog-collection__relations-branch\s*>\s*\.catalog-collection__relations-list\s*\{[^}]*padding-left/,
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
