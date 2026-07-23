/**
 * MECH-GUARD R3 — the saved-view label keeps a real gap from the chip strip (structural layer).
 *
 * Owner catch (review r2): the "Saved view" micro-label sat flush against the "All" chip,
 * reading as one fused blob instead of a label OF the strip.
 * Skill rule mechanized: taste §7 "Align & Space Perfectly … avoid floating elements with
 * awkward gaps" (.claude/skills/taste/SKILL.md); ui-ux-pro-max ux-guidelines "Touch Spacing —
 * minimum 8px gap" as the floor between adjacent inline elements.
 *
 * jsdom has no layout engine, so this layer pins the authored spacing declaration (≥8px
 * inline-end margin on the label). The measured on-screen gap (≥8px between the label's right
 * edge and the first chip's left edge) lives in e2e/guards.geometry.spec.ts (GUARD-R3).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/record-collection/collection-toolbar.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBody(selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected collection-toolbar.css to style ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('GUARD-R3: the saved-view label→chip seam is an authored ≥8px gap', () => {
  it('GUARD-R3: .collection-toolbar__views-label declares margin-inline-end ≥ 8px', () => {
    const body = ruleBody('.collection-toolbar__views-label')
    const m = body.match(/margin-inline-end:\s*([0-9.]+)px/)
    expect(m, 'label must declare a margin-inline-end in px').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(8)
  })
})
