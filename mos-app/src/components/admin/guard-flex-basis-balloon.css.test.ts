/**
 * MECH-GUARD — flex-basis balloon on column reflow (Census R2 DO-3, admin-people P1).
 *
 * Defect class: a control authored `flex: 1 1 <px>` for a ROW context keeps that basis when
 * a mobile media block flips the container to `flex-direction: column` — the width-basis then
 * governs HEIGHT, ballooning the control (~180px-tall search field on the People phone toolbar;
 * cafe's `.cafe-capture-link` is the same root cause, pinned by the cafe lane).
 *
 * jsdom has no layout engine, so this layer pins the authored declarations: inside the phone
 * column block the search-mini must RESET its basis (`flex: 0 0 auto`) and keep the 44px
 * coarse floor. Rides with DO-22(d): the equal-share phone status tabs keep every label on
 * one line (`white-space: nowrap` — "No login" wrapped to two lines).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/admin/people-toolbar.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of the phone reflow media block (brace-balanced slice). */
function phoneMediaBlock(): string {
  const idx = css.search(/@media\s*\(max-width:\s*767px\)/)
  expect(idx, 'people-toolbar.css must keep its <768px reflow block').toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  let depth = 1
  let i = open + 1
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') depth -= 1
    i += 1
  }
  return css.slice(open + 1, i - 1)
}

function ruleBodyWithin(block: string, selector: string): string {
  const idx = block.indexOf(selector)
  expect(idx, `phone block must style ${selector}`).toBeGreaterThanOrEqual(0)
  const open = block.indexOf('{', idx)
  const close = block.indexOf('}', open)
  return block.slice(open + 1, close)
}

describe('GUARD DO-3: the People phone toolbar resets the row flex-basis when the container goes column', () => {
  it('DO-3: phone .people-search-mini resets its basis (flex: 0 0 auto) so the 180px width-basis cannot govern height', () => {
    const body = ruleBodyWithin(phoneMediaBlock(), '.people-search-mini')
    expect(body).toMatch(/flex:\s*0\s+0\s+auto/)
  })

  it('DO-3: phone .people-search-mini keeps the coarse floor (min-height ≥ 44px)', () => {
    const body = ruleBodyWithin(phoneMediaBlock(), '.people-search-mini')
    const m = body.match(/min-height:\s*([0-9.]+)px/)
    expect(m, 'search-mini must declare a px min-height in the phone block').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(44)
  })

  it('DO-22(d): phone status-tab labels never wrap (white-space: nowrap)', () => {
    const body = ruleBodyWithin(phoneMediaBlock(), '.people-status-tabs .view-tabs__tab')
    expect(body).toMatch(/white-space:\s*nowrap/)
  })
})
