// FailLoudBadge stylesheet pins — #359. jsdom computes no layout/color, so the CSS file
// is the oracle (same pattern as the kpi-tile and data-table pins). The badge carries
// free-length reason prose, and its status text sits on a light tint — both rulings are
// one deletion away from silently regressing.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'fail-loud-badge.css'), 'utf8')

describe('fail-loud-badge.css — #359 pins', () => {
  it('AA text: status text tokens on the tints, never the base destructive/success hues', () => {
    const warn = css.split('.fail-loud--warn {')[1]?.split('}')[0] ?? ''
    const ok = css.split('.fail-loud--ok {')[1]?.split('}')[0] ?? ''
    expect(warn).toContain('color: var(--status-lost-text)')
    expect(ok).toContain('color: var(--status-won-text)')
    expect(warn).not.toMatch(/color: var\(--destructive\)/)
    expect(ok).not.toMatch(/color: var\(--success\)/)
  })

  it('rounded-rect shell (--radius-sm), not a pill', () => {
    const shell = css.split('.fail-loud {')[1]?.split('}')[0] ?? ''
    expect(shell).toContain('border-radius: var(--radius-sm)')
  })

  it('wrapping prose: flex-start alignment + first-line dot offset, and no nowrap shell', () => {
    const shell = css.split('.fail-loud {')[1]?.split('}')[0] ?? ''
    const dot = css.split('.fail-loud-dot {')[1]?.split('}')[0] ?? ''
    expect(shell).toContain('align-items: flex-start')
    expect(shell).not.toContain('white-space: nowrap')
    expect(dot).toContain('margin-top: 4px')
  })
})
