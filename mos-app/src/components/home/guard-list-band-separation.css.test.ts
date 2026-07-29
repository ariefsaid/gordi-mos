/**
 * MECH-GUARD — the List arrangement's region headers must SEPARATE their groups.
 *
 * Owner, 2026-07-28: "i dont like the header on the current wall of text." The shipped List
 * rendered each region label as a muted 12px overline stacked above its rows, so the header
 * carried no more weight than the row titles under it (15px/600 `foreground`) and four groups
 * read as one undifferentiated column.
 *
 * The signed mockup (docs/design-mockups/home-priority-2026-07-28/index.html, `#c .band-label`)
 * already answered this: the band label is the DISPLAY face at a heading rung in full
 * `foreground`, sentence case — not an overline — and each band opens with a 1px `border`
 * hairline. This file pins those two declarations, because jsdom has no layout engine and the
 * unit tests that render List assert text, not paint; the rendered PNGs are the visual evidence.
 *
 * NOT color (the rejected third rung): amber / red / blue already mean overdue / blocked /
 * in-progress on these very rows, so a decorative hue on the header would collide with the
 * status vocabulary. Contrast + weight + an edge is the whole fix.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripped(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected a rule for ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

const CSS = 'src/components/home/home-stream.css'

describe('List region headers separate their groups (owner: "wall of text", 2026-07-28)', () => {
  it('the band label outranks the row titles beneath it: display face, heading rung, full foreground', () => {
    const body = ruleBody(stripped(CSS), '.stream-band-label ')
    expect(body, 'label must use the display face, like the mockup #c .band-label')
      .toMatch(/font-family:\s*var\(--font-display\)/)
    expect(body, 'label must sit a rung ABOVE the 15px/600 row title it heads')
      .toMatch(/font-size:\s*var\(--font-size-subheading\)/)
    expect(body, 'label must be full foreground — muted is what made it recede into the rows')
      .toMatch(/color:\s*var\(--foreground\)/)
    expect(body).not.toMatch(/color:\s*var\(--muted-foreground\)/)
    expect(body, 'sentence case: an uppercase overline is a divider, not a group header')
      .not.toMatch(/text-transform:\s*uppercase/)
  })

  it('each band opens with a hairline edge so the group has a visible boundary', () => {
    const body = ruleBody(stripped(CSS), '.stream-band ')
    expect(body).toMatch(/border-top:\s*1px solid var\(--border\)/)
    expect(body, 'space between the rule and the label it introduces').toMatch(/padding-top:\s*var\(--ds-spacing-/)
  })

  it('the header carries no decorative hue — amber/red/blue are the row status vocabulary', () => {
    const body = ruleBody(stripped(CSS), '.stream-band-label ')
    expect(body).not.toMatch(/--warning|--destructive|--primary|--violet|--brand-orange/)
  })
})
