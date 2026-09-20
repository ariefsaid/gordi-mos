// #855 residual E1 — the sticky action footer must clear the phone bottom-tab bar using the
// shell's own token (`--tabbar-h`, index.css), never a magic number, and must stay wrappable so
// the blocking reason line cannot crowd Discard/Submit off the visible row (the actual defect:
// `flex-wrap: nowrap` fought `.kl-submit-reason`'s `flex-basis: 100%`).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-log-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleBodyAt(idx: number): string {
  expect(idx, 'expected kitchen-log-page.css to style the phone .kl-footer override').toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('KL-FOOTER-NAV: the phone sticky footer clears the shell bottom-tab bar', () => {
  // `.kl-footer {` is declared twice: the base rule, then its phone (max-width: 767.98px)
  // override further down the file — the LAST occurrence is that phone override.
  const phoneFooterIdx = css.lastIndexOf('.kl-footer {')

  it('the phone .kl-footer offsets by the shell bottom-nav token (--tabbar-h), not a magic number', () => {
    const body = ruleBodyAt(phoneFooterIdx)
    expect(body).toMatch(/bottom:\s*calc\(-1 \* \(16px \+ var\(--tabbar-h,\s*60px\)\)\)/)
    expect(body).toMatch(/margin-bottom:\s*calc\(-1 \* \(16px \+ var\(--tabbar-h,\s*60px\)\)\)/)
  })

  it('the phone .kl-footer stays flex-wrap: wrap, so the blocking reason line can push onto its own line instead of crowding out Discard/Submit', () => {
    const body = ruleBodyAt(phoneFooterIdx)
    expect(body).toMatch(/flex-wrap:\s*wrap/)
  })
})
