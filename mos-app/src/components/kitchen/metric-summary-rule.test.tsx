// MetricSummaryRule: one inline line of label and value pairs; a delta only when one is passed.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MetricSummaryRule } from './metric-summary-rule'

const FIXTURES = [
  { key: 'submitted', label: 'Submitted', value: '3' },
  { key: 'offplan', label: 'Off-plan', value: '1', delta: { text: 'note required to approve', tone: 'destructive' as const } },
]

describe('MetricSummaryRule', () => {
  it('renders one line of label and value pairs', () => {
    render(<MetricSummaryRule ariaLabel="Queue summary" metrics={FIXTURES} />)
    const rule = document.querySelector('.msr')!
    expect(rule.getAttribute('aria-label')).toBe('Queue summary')
    const items = rule.querySelectorAll('.msr-item')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.msr-label')?.textContent).toBe('Submitted')
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
})
