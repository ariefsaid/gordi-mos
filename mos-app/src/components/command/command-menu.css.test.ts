// PR-6 AC-D01/AC-D02 (RI-1/RI-2, ADR-0013 Decision 2) — the ⌘K command menu is a themed
// overlay scope, so it MUST set its own text `color` explicitly (never inherit the body's
// computed light-theme color into a .dark scope — the verified offender). Group labels (a
// meta role) must use the tertiary/muted ramp, not the failing --ds-font-color-light ramp.
// jsdom can't measure contrast, so we assert at the CSS-SOURCE level.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/command/command-menu.css'), 'utf8')

function ruleBody(selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector} in command-menu.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('AC-D01: the command-menu overlay scope sets text color explicitly', () => {
  it('AC-D01: .cm-panel sets an explicit color (no inheriting the body light-theme color into .dark)', () => {
    expect(ruleBody('.cm-panel {')).toMatch(/color:\s*var\(--/)
  })

  it('AC-D01: .cm-item rows set an explicit color', () => {
    expect(ruleBody('.cm-item {')).toMatch(/color:\s*var\(--/)
  })

  it('AC-D01: the input sets an explicit color (not inherited)', () => {
    expect(ruleBody('.cm-input input {')).toMatch(/color:\s*var\(--/)
  })
})

describe('AC-D02: command-menu group labels use the muted/tertiary ramp, not the light ramp', () => {
  it('AC-D02: .cm-group label uses --muted-foreground (≈4.6:1), never --ds-font-color-light (≈3.1:1)', () => {
    const body = ruleBody('.cm-group {')
    expect(body).toMatch(/color:\s*var\(--muted-foreground\)/)
    expect(body).not.toMatch(/font-color-light|--text-light/)
  })
})

/**
 * The palette is a FLAT list, and it lists the Work PARENT row ("Work" → /work/tasks) directly
 * above the Tasks CHILD row (→ /work/tasks). Two adjacent rows, one target: if they render at one
 * weight with one indent, the second row has no visible reason to exist. The rail and the drawer
 * are spared this only because their children sit inside a drawn indent guide.
 *
 * DESIGN.md § The Rail Type Ladder binds the answer — "the ladder is per-level, not per-surface":
 * a child wears the Child rung wherever it is listed. So `data-child` must actually carry that
 * rung here, expressed in the shared grammar (type ramp + `--rail-*` geometry tokens) rather than
 * in numbers minted for this one stylesheet.
 *
 * Asserted at the CSS SOURCE, like AC-D01/AC-D02 above: jsdom applies no stylesheet, so a
 * rendered-DOM assertion here would pass against an empty rule.
 */
describe('the ⌘K palette carries the ladder Child rung on data-child rows', () => {
  const childRule = '.cm-item[data-child=\'true\'] {'

  it('a child row is indented behind the hairline guide, not merely padded', () => {
    const body = ruleBody(childRule)
    expect(body).toMatch(/margin-left:\s*var\(--rail-child-guide-x\)/)
    expect(body).toMatch(/border-left:\s*var\(--rail-child-guide\)\s+solid\s+var\(--border\)/)
    expect(body).toMatch(/padding-left:\s*var\(--rail-child-pad\)/)
  })

  it('a child label steps down in size AND colour', () => {
    const body = ruleBody(childRule)
    expect(body).toMatch(/font-size:\s*var\(--font-size-mono\)/)
    expect(body).toMatch(/color:\s*var\(--muted-foreground\)/)
  })

  /**
   * The rung's own defect, caught by measuring the render rather than by reading DESIGN.md:
   * the ladder's Child weight (500) is a step DOWN from its Destination weight (600), but the
   * palette's rows declare no weight at all (400). Importing the 500 alone made Tasks BOLDER
   * than the Work row above it — the hierarchy inverted by the rule meant to state it.
   *
   * So the invariant is the RELATIONSHIP, not the number: a child is never heavier than the
   * row it hangs under. Asserted against `.cm-item`'s own declared weight, so raising the
   * palette's destination voice later stays free while re-introducing the inversion does not.
   */
  it('a child is never heavier than the destination row it hangs under', () => {
    const weightOf = (selector: string): number => {
      const m = /font-weight:\s*(\d+)/.exec(ruleBody(selector))
      return m ? Number(m[1]) : 400 // undeclared === the initial value
    }
    const child = weightOf(childRule)
    const parent = weightOf('.cm-item {')
    expect(child, `child weight ${child} vs destination row ${parent}`).toBeLessThanOrEqual(parent)
  })

  it('the rung mints no colour or length of its own — every value is a shared token', () => {
    const body = ruleBody(childRule)
    expect(body, 'child rung declares a literal colour').not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i)
    expect(body, 'child rung declares a raw length').not.toMatch(/\d+(\.\d+)?(px|rem|em)\b/)
  })

  /**
   * BOTH axes, and no raw length on either.
   *
   * `width` alone left this rule half-guarded: `height` was asserted by nothing in the repo, so a
   * reviewer could rewrite it to a raw `22px` — an oblong glyph, off the rung and off the token
   * vocabulary — and every guard that could plausibly have caught it (this file, tap-targets,
   * the token-vocab and kit-vocab scans, the chrome CSS contract) stayed green. The raw-length
   * clause is the general form of the same hole, applied here the way it is already applied to
   * the rung rule above.
   */
  it('the child glyph steps down on BOTH axes, in tokens', () => {
    const body = ruleBody('.cm-item[data-child=\'true\'] .cm-item-glyph svg {')
    expect(body).toMatch(/width:\s*var\(--rail-icon-child\)/)
    expect(body).toMatch(/height:\s*var\(--rail-icon-child\)/)
    expect(body, 'child glyph declares a raw length').not.toMatch(/\d+(\.\d+)?(px|rem|em)\b/)
  })

  it('active outranks the rung on SPECIFICITY, not on source order', () => {
    // The scar: two single-class rules on one element have no tie-break. `.cm-item.active` and
    // `.cm-item[data-child]` are both (0,2,0), and the rung is declared after it — so without a
    // COMPOUND rule an active child would keep the muted colour against the active background.
    expect(css).toContain('.cm-item[data-child=\'true\'].active')
    expect(ruleBody('.cm-item[data-child=\'true\'].active {')).toMatch(/color:\s*var\(--text-primary\)/)
  })
})
