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
