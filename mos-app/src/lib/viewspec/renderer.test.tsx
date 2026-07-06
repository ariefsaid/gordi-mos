// UserViewRenderer tests (AC-UV-015..017 + P1 review fix-wave items 8-10). Mocks ./executor to
// isolate the compile→execute→hydrate loop from a real supabase call. Wrapped in I18nProvider
// (mirrors home-page.test.tsx).
import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('./executor', () => ({ executeCompiledQuery: vi.fn() }))
import { executeCompiledQuery } from './executor'
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: vi.fn(() => true) }))
import { UserViewRenderer, buildCompilerContext } from './renderer'
import type { CompositionSpec } from './types'
import type { ExecutedQueryResult } from './executor'

const mockExecute = vi.mocked(executeCompiledQuery)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, null, children)
}

function result(rows: unknown[], truncated = false): ExecutedQueryResult {
  return { rows, truncated }
}

const ctx = buildCompilerContext('person-1', 'org-1')

const validSpec: CompositionSpec = {
  version: 1,
  panels: [{
    id: 'p1', primitive: 'DataTable',
    querySpec: { entity: 'objectives', select: ['id', 'name'] },
  }],
}

beforeEach(() => { mockExecute.mockReset() })

describe('UserViewRenderer — AC-UV-015 (compile→execute→hydrate loop)', () => {
  it('compiles a valid spec, executes each panel once, and hydrates the registered primitive', async () => {
    mockExecute.mockResolvedValue(result([{ id: '1', name: 'Grow revenue' }, { id: '2', name: 'Cut cost' }]))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    const panel = await screen.findByTestId('uv-panel-DataTable')
    expect(panel).toBeInTheDocument()
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('never shows a loading flash for the compile step — compile is synchronous (useMemo, item 8)', async () => {
    // If compile were still behind a useEffect+useState (the old async pattern), the FIRST
    // render would show the loading section before the effect flushes. With useMemo the
    // compiled panels are available synchronously on the very first render.
    mockExecute.mockResolvedValue(result([]))
    const { container } = render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })
    expect(container.querySelector('.uv-render--loading')).not.toBeInTheDocument()
    await screen.findByTestId('uv-panel-DataTable')
  })
})

describe('UserViewRenderer — AC-UV-016 (degrades on ValidationError, never crashes)', () => {
  it('shows the error state with UNKNOWN_PRIMITIVE and never calls the executor', async () => {
    const bad: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'Bogus', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    render(<UserViewRenderer spec={bad} ctx={ctx} />, { wrapper })

    expect(await screen.findByText('This view could not be rendered')).toBeInTheDocument()
    expect(screen.getByTestId('uv-render-error-code')).toHaveTextContent('UNKNOWN_PRIMITIVE')
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('shows the error state with UNKNOWN_ENTITY for an off-whitelist entity and never calls the executor', async () => {
    const bad: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'DataTable', querySpec: { entity: 'nope' as never, select: ['id'] } }],
    }
    render(<UserViewRenderer spec={bad} ctx={ctx} />, { wrapper })

    expect(await screen.findByTestId('uv-render-error-code')).toHaveTextContent('UNKNOWN_ENTITY')
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('UserViewRenderer — AC-UV-017 (stub primitive degrades to a placeholder)', () => {
  it('renders the "planned primitive" placeholder for a stub primitive and never calls the executor', async () => {
    const stubSpec: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'doc-editor', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    render(<UserViewRenderer spec={stubSpec} ctx={ctx} />, { wrapper })

    expect(await screen.findByTestId('uv-stub-doc-editor')).toBeInTheDocument()
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('CutToggle (a "live" registry primitive with no P1 query binding) also degrades to the planned placeholder', async () => {
    const spec: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'CutToggle', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    render(<UserViewRenderer spec={spec} ctx={ctx} />, { wrapper })

    expect(await screen.findByTestId('uv-stub-CutToggle')).toBeInTheDocument()
    expect(mockExecute).not.toHaveBeenCalled()
  })
})

describe('UserViewRenderer — per-panel executor error (degrades that panel only)', () => {
  it('shows the panel error state when executeCompiledQuery rejects', async () => {
    mockExecute.mockRejectedValue(new Error('boom'))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    await waitFor(() => expect(screen.getByText('This panel could not be loaded.')).toBeInTheDocument())
  })
})

describe('UserViewRenderer — real DataTable hydration (item 9)', () => {
  it('renders an actual DataTable with columns from resolvedSelect + rows from the executed data', async () => {
    mockExecute.mockResolvedValue(result([
      { id: '1', name: 'Grow revenue' },
      { id: '2', name: 'Cut cost' },
    ]))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    const table = await screen.findByRole('table')
    expect(table).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument()
    expect(screen.getByText('Grow revenue')).toBeInTheDocument()
    expect(screen.getByText('Cut cost')).toBeInTheDocument()
  })

  it('shows the DataTable empty state when the executor returns zero rows', async () => {
    mockExecute.mockResolvedValue(result([]))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })
    expect(await screen.findByText('No rows to show.')).toBeInTheDocument()
  })
})

describe('UserViewRenderer — real KPITile hydration (item 9)', () => {
  const kpiSpecWithAggregate: CompositionSpec = {
    version: 1,
    panels: [{
      id: 'p1', primitive: 'KPITile',
      querySpec: {
        entity: 'sales_daily_revenue', select: ['clean_revenue'],
        aggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
        timeRange: { column: 'revenue_date', from: '2026-01-01', to: '2026-01-31' },
      },
      props: { label: 'Total revenue' },
    }],
  }
  it('uses the aggregate result as the KPITile value when an aggregate is present', async () => {
    mockExecute.mockResolvedValue(result([{ total: 12345 }]))
    render(<UserViewRenderer spec={kpiSpecWithAggregate} ctx={ctx} />, { wrapper })

    const tile = await screen.findByRole('group', { name: 'Total revenue' })
    expect(tile).toHaveTextContent('12345')
  })

  const kpiSpecNoAggregate: CompositionSpec = {
    version: 1,
    panels: [{
      id: 'p1', primitive: 'KPITile',
      querySpec: { entity: 'objectives', select: ['id'] },
      props: { label: 'Objective count' },
    }],
  }
  it('uses the row count as the KPITile value when no aggregate is present', async () => {
    mockExecute.mockResolvedValue(result([{ id: '1' }, { id: '2' }, { id: '3' }]))
    render(<UserViewRenderer spec={kpiSpecNoAggregate} ctx={ctx} />, { wrapper })

    const tile = await screen.findByRole('group', { name: 'Objective count' })
    expect(tile).toHaveTextContent('3')
  })

  it('falls back to the panel/primitive name as the KPITile label when no props.label is given', async () => {
    const spec: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'KPITile', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    mockExecute.mockResolvedValue(result([{ id: '1' }]))
    render(<UserViewRenderer spec={spec} ctx={ctx} />, { wrapper })
    expect(await screen.findByRole('group', { name: 'KPITile' })).toBeInTheDocument()
  })
})

describe('UserViewRenderer — real ChartFrame hydration (item 9)', () => {
  it('renders an actual ChartFrame as an empty frame with the pending-binding body', async () => {
    const spec: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'ChartFrame', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    mockExecute.mockResolvedValue(result([{ id: '1' }]))
    render(<UserViewRenderer spec={spec} ctx={ctx} />, { wrapper })

    expect(await screen.findByRole('region')).toBeInTheDocument()
    expect(screen.getByText('Chart binding lands with the builder.')).toBeInTheDocument()
  })
})

describe('UserViewRenderer — FreshnessLabel hydration (item 9)', () => {
  const freshnessSpec: CompositionSpec = {
    version: 1,
    panels: [{
      id: 'p1', primitive: 'FreshnessLabel',
      querySpec: {
        entity: 'sales_daily_revenue', select: ['revenue_date', 'snapshot_as_of'],
        timeRange: { column: 'revenue_date', from: '2026-01-01', to: '2026-01-31' },
      },
    }],
  }
  it('renders the FreshnessLabel using the max snapshot_as_of across the returned rows', async () => {
    mockExecute.mockResolvedValue(result([
      { revenue_date: '2026-01-01', snapshot_as_of: '2026-01-02T00:00:00Z' },
      { revenue_date: '2026-01-02', snapshot_as_of: '2026-01-03T00:00:00Z' },
    ]))
    render(<UserViewRenderer spec={freshnessSpec} ctx={ctx} />, { wrapper })

    expect(await screen.findByText(/as of/i)).toBeInTheDocument()
  })

  it('does NOT render a FreshnessLabel when resolvedSelect lacks snapshot_as_of', async () => {
    const spec: CompositionSpec = {
      version: 1,
      panels: [{ id: 'p1', primitive: 'FreshnessLabel', querySpec: { entity: 'objectives', select: ['id'] } }],
    }
    mockExecute.mockResolvedValue(result([{ id: '1' }]))
    render(<UserViewRenderer spec={spec} ctx={ctx} />, { wrapper })

    await screen.findByTestId('uv-panel-FreshnessLabel')
    expect(screen.queryByText(/as of/i)).not.toBeInTheDocument()
  })
})

describe('UserViewRenderer — truncation warning (item 6 + item 9)', () => {
  it('shows a role="status" truncation warning when the executor reports truncated: true', async () => {
    mockExecute.mockResolvedValue(result([{ id: '1', name: 'a' }], true))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    const warning = await screen.findByRole('status', { name: '' })
    expect(warning).toBeInTheDocument()
  })
  it('shows no truncation warning when truncated is false', async () => {
    mockExecute.mockResolvedValue(result([{ id: '1', name: 'a' }], false))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    await screen.findByTestId('uv-panel-DataTable')
    expect(screen.queryByTestId('uv-panel-truncated')).not.toBeInTheDocument()
  })
})

describe('UserViewRenderer — SECURITY INVARIANT: spec/row data renders as inert text only (item 9)', () => {
  it('a malicious HTML string in a row value renders as literal text — no element is created from it', async () => {
    const xss = '<img src=x onerror=alert(1)>'
    mockExecute.mockResolvedValue(result([{ id: '1', name: xss }]))
    render(<UserViewRenderer spec={validSpec} ctx={ctx} />, { wrapper })

    await screen.findByTestId('uv-panel-DataTable')
    // The literal string is present as text content...
    expect(screen.getByText(xss)).toBeInTheDocument()
    // ...and no <img> element was ever created from it (React escaped it — never dangerouslySetInnerHTML).
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('a javascript: URL string in a row value never becomes an anchor href', async () => {
    const spec: CompositionSpec = {
      version: 1,
      panels: [{
        id: 'p1', primitive: 'DataTable',
        querySpec: { entity: 'objectives', select: ['id', 'name'] },
      }],
    }
    mockExecute.mockResolvedValue(result([{ id: '1', name: 'javascript:alert(1)' }]))
    render(<UserViewRenderer spec={spec} ctx={ctx} />, { wrapper })

    await screen.findByTestId('uv-panel-DataTable')
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument()
    // No anchor is ever produced from spec/row data — drill-links are not part of P1 binding.
    expect(document.querySelector('a[href^="javascript:"]')).not.toBeInTheDocument()
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })
})
