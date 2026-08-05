/**
 * MECH-GUARD — Census R2 DO-16 home layout pins (jsdom has no layout engine, so this
 * layer pins the authored declarations; the census PNGs are the visual evidence).
 *
 * (a) home F3 — the phone order-disclosure is a COLUMN so the opened panel stacks below
 *     its trigger instead of squeezing/clipping it on one phone-width row.
 * (c) home F5 — the stream-row title is 2-line clamped at ≥481 (was single-line nowrap,
 *     starving the Urgent Signal's identity at 768/1024); phone keeps the full wrap.
 * (d) home F6 — the ambient Signals tail keeps the stream's own 24px group seam.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripped(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function ruleBody(css: string, selector: string, from = 0): string {
  const idx = css.indexOf(selector, from)
  expect(idx, `expected a rule for ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('GUARD DO-16: home layout census pins', () => {
  it('DO-16(c): .stream-row-title is 2-line clamped, never single-line nowrap', () => {
    const css = stripped('src/components/home/home-stream.css')
    const body = ruleBody(css, '.stream-row-title ')
    expect(body).toMatch(/line-clamp:\s*2/)
    expect(body).not.toMatch(/white-space:\s*nowrap/)
  })

  it('DO-16(c): the ≤480 phone block undoes the clamp so the title wraps fully (Luna P0-1(b))', () => {
    const css = stripped('src/components/home/home-stream.css')
    const phoneIdx = css.search(/@media\s*\(max-width:\s*480px\)/)
    expect(phoneIdx).toBeGreaterThanOrEqual(0)
    const body = ruleBody(css, '.stream-row-title ', phoneIdx)
    expect(body).toMatch(/line-clamp:\s*none/)
    expect(body).toMatch(/white-space:\s*normal/)
  })

  it('DO-16(d): .signal-feed-section carries the 24px stream-group seam above the ambient tail', () => {
    const body = ruleBody(stripped('src/components/signals/signal-feed-section.css'), '.signal-feed-section ')
    expect(body).toMatch(/margin-top:\s*var\(--ds-spacing-6,\s*24px\)/)
  })
})
