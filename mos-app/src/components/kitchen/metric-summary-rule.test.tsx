// MetricSummaryRule — DESIGN.md § "Metric summary rule (v4, 2026-07-27)".
// One inline metrics line: label at label size in muted-foreground, value at
// body-lg/600 tabular, ~22px apart, closed by one 1px hairline. No card, no
// shadow, no radius, no width branch. Deltas only when worth acting on.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { MetricSummaryRule } from './metric-summary-rule'

const FIXTURES = [
  { key: 'submitted', label: 'Submitted', value: '3' },
  { key: 'offplan', label: 'Off-plan', value: '1', delta: { text: 'note required to approve', tone: 'destructive' as const } },
]

describe('MetricSummaryRule — the band (default)', () => {
  it('renders one line of label:value pairs, value tabular', () => {
    render(<MetricSummaryRule ariaLabel="Queue summary" metrics={FIXTURES} />)
    const rule = document.querySelector('.msr')!
    expect(rule.getAttribute('aria-label')).toBe('Queue summary')
    const items = rule.querySelectorAll('.msr-item')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.msr-label')?.textContent).toBe('Submitted')
    expect(items[0].querySelector('.msr-value')?.classList.contains('tabular')).toBe(true)
    expect(items[0].querySelector('.msr-value')?.textContent).toBe('3')
  })

  it('renders a delta only when one is passed, tone-styled', () => {
    render(<MetricSummaryRule ariaLabel="s" metrics={FIXTURES} />)
    const delta = document.querySelector('.msr-delta--destructive')!
    expect(delta.textContent).toBe('note required to approve')
  })

  it('no delta element renders when no metric carries one', () => {
    render(<MetricSummaryRule ariaLabel="s" metrics={[FIXTURES[0]]} />)
    expect(document.querySelector('.msr-delta')).toBeNull()
  })

  it('CSS: one hairline underneath; no card, no shadow, no radius, no width branch', () => {
    // jsdom has no layout — assert the rules that produce the shape (repo idiom:
    // pushes/log tests read sibling CSS the same way).
    const css = readFileSync(resolve(process.cwd(), 'src/components/kitchen/metric-summary-rule.css'), 'utf8')
    const band = css.match(/\.msr\s*\{([^}]*)\}/)![1]
    expect(band).toContain('border-bottom: 1px solid var(--border)')
    expect(band).toContain('gap: 6px 22px')
    expect(css).not.toMatch(/box-shadow/)
    expect(css).not.toMatch(/border-radius/)
    expect(css).not.toMatch(/@media/) // no width branch, ever
  })
})

describe('MetricSummaryRule — inline variant (page-head meta line)', () => {
  it('drops the hairline and tightens the gaps (kl-meta-line idiom)', () => {
    render(<MetricSummaryRule variant="inline" metrics={FIXTURES} />)
    const css = readFileSync(resolve(process.cwd(), 'src/components/kitchen/metric-summary-rule.css'), 'utf8')
    const inline = css.match(/\.msr--inline\s*\{([^}]*)\}/)![1]
    expect(inline).toContain('border-bottom: none')
    expect(document.querySelector('.msr--inline .msr-item')).not.toBeNull()
  })
})