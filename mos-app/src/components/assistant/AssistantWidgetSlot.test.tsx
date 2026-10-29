import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssistantWidgetSlot } from './AssistantWidgetSlot'
import type { AgentWidget } from '@/lib/agent/widgets'

describe('AssistantWidgetSlot — Negative chart values (issue #1890)', () => {
  it('draws a zero baseline with positive and negative bars on their respective sides without negative SVG rect heights', () => {
    const widget: AgentWidget = {
      kind: 'data_chart',
      title: 'Net Margin by Quarter',
      xKey: 'quarter',
      yKey: 'margin',
      points: [
        { quarter: 'Q1', margin: 50 },
        { quarter: 'Q2', margin: -25 },
        { quarter: 'Q3', margin: 100 },
        { quarter: 'Q4', margin: -50 },
      ],
    }

    const { container } = render(<AssistantWidgetSlot widget={widget} />)

    // Heading / chart region
    expect(screen.getByRole('region', { name: 'Net Margin by Quarter' })).toBeInTheDocument()

    // Zero baseline line is drawn as a horizontal reference
    const baseline = screen.getByTestId('zero-baseline')
    expect(baseline).toBeInTheDocument()
    expect(baseline.getAttribute('y1')).toBe(baseline.getAttribute('y2'))
    const baselineY = parseFloat(baseline.getAttribute('y1') ?? '0')
    expect(Number.isFinite(baselineY)).toBe(true)

    // Check all SVG rect elements
    const rects = container.querySelectorAll('rect[role="graphics-symbol"]')
    expect(rects).toHaveLength(4)

    rects.forEach((rect) => {
      const height = parseFloat(rect.getAttribute('height') ?? '-1')
      const y = parseFloat(rect.getAttribute('y') ?? '-1')

      // Acceptance: Never generate a negative SVG rectangle height; must be finite numbers
      expect(height).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(height)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    })

    // Positive bar (Q1: 50, Q3: 100) sits on positive side (above baseline)
    const q1Rect = screen.getByRole('graphics-symbol', { name: 'Q1: 50' })
    const q1Y = parseFloat(q1Rect.getAttribute('y') ?? '0')
    const q1Height = parseFloat(q1Rect.getAttribute('height') ?? '0')
    expect(q1Y).toBeLessThan(baselineY)
    expect(Math.abs(q1Y + q1Height - baselineY)).toBeLessThan(0.01)

    // Negative bar (Q2: -25, Q4: -50) sits on negative side (below baseline)
    const q2Rect = screen.getByRole('graphics-symbol', { name: 'Q2: -25' })
    const q2Y = parseFloat(q2Rect.getAttribute('y') ?? '0')
    const q2Height = parseFloat(q2Rect.getAttribute('height') ?? '0')
    expect(q2Y).toBe(baselineY)
    expect(q2Height).toBeGreaterThan(0)
    expect(q2Y + q2Height).toBeGreaterThan(baselineY)
  })

  it('draws baseline and extends positive bars upward when all values are positive', () => {
    const widget: AgentWidget = {
      kind: 'data_chart',
      title: 'Positive Revenue',
      xKey: 'month',
      yKey: 'revenue',
      points: [
        { month: 'Jan', revenue: 100 },
        { month: 'Feb', revenue: 200 },
      ],
    }

    render(<AssistantWidgetSlot widget={widget} />)

    const baseline = screen.getByTestId('zero-baseline')
    expect(baseline).toBeInTheDocument()
    expect(baseline.getAttribute('y1')).toBe(baseline.getAttribute('y2'))
    const baselineY = parseFloat(baseline.getAttribute('y1') ?? '0')

    const janRect = screen.getByRole('graphics-symbol', { name: 'Jan: 100' })
    const janY = parseFloat(janRect.getAttribute('y') ?? '0')
    const janHeight = parseFloat(janRect.getAttribute('height') ?? '0')
    expect(janHeight).toBeGreaterThan(0)
    expect(janY + janHeight).toBeCloseTo(baselineY)
  })

  it('draws baseline and extends negative bars downward with positive rect heights when all values are negative', () => {
    const widget: AgentWidget = {
      kind: 'data_chart',
      title: 'Net Losses',
      xKey: 'dept',
      yKey: 'loss',
      points: [
        { dept: 'Ops', loss: -40 },
        { dept: 'Dev', loss: -80 },
      ],
    }

    render(<AssistantWidgetSlot widget={widget} />)

    const baseline = screen.getByTestId('zero-baseline')
    expect(baseline).toBeInTheDocument()
    expect(baseline.getAttribute('y1')).toBe(baseline.getAttribute('y2'))
    const baselineY = parseFloat(baseline.getAttribute('y1') ?? '0')

    const opsRect = screen.getByRole('graphics-symbol', { name: 'Ops: -40' })
    const opsY = parseFloat(opsRect.getAttribute('y') ?? '0')
    const opsHeight = parseFloat(opsRect.getAttribute('height') ?? '0')
    expect(opsY).toBe(baselineY)
    expect(opsHeight).toBeGreaterThan(0)
    expect(opsY + opsHeight).toBeGreaterThan(baselineY)
  })

  it('presents unsupported data as a table when series has no numeric values', () => {
    const widget: AgentWidget = {
      kind: 'data_chart',
      title: 'Unsupported Non-Numeric Series',
      xKey: 'name',
      yKey: 'status',
      points: [
        { name: 'Alpha', status: 'Pending' },
        { name: 'Beta', status: 'Completed' },
      ],
    }

    render(<AssistantWidgetSlot widget={widget} />)

    // Falls back to table view with matching caption
    expect(screen.getByLabelText('Unsupported Non-Numeric Series')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders data_table and data_insight widgets correctly', () => {
    const tableWidget: AgentWidget = {
      kind: 'data_table',
      title: 'Staff Schedule',
      columns: [
        { key: 'name', header: 'Staff Name' },
        { key: 'role', header: 'Role' },
      ],
      rows: [{ name: 'Arief', role: 'Lead' }],
    }

    const { rerender } = render(<AssistantWidgetSlot widget={tableWidget} />)
    expect(screen.getByLabelText('Staff Schedule')).toBeInTheDocument()
    expect(screen.getByText('Arief')).toBeInTheDocument()

    const insightWidget: AgentWidget = {
      kind: 'data_insight',
      title: 'Today Revenue',
      value: 1250000,
      detail: '+12% vs yesterday',
    }

    rerender(<AssistantWidgetSlot widget={insightWidget} />)
    expect(screen.getByText('Today Revenue')).toBeInTheDocument()
    expect(screen.getByText('1250000')).toBeInTheDocument()
    expect(screen.getByText('+12% vs yesterday')).toBeInTheDocument()
  })
})
