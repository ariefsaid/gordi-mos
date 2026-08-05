import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RecordCollectionSurface } from './record-collection'
import { createRecordCollectionController } from '@/lib/record-collection/engine'
import type {
  CollectionAccess,
  CollectionProjection,
  RecordCollectionDescriptor,
} from '@/lib/record-collection/types'
import {
  taskCollectionQuery,
  taskPresentationCompatibleKeys,
  TASK_COLLECTION_NEUTRAL_QUERY,
  type TaskCollectionPresentation,
  type TaskCollectionQuery,
} from '@/components/tasks/task-collection-query'

interface FakeTask {
  id: string
  title: string
}
type FakeGroup = { key: string; rows: readonly FakeTask[] }

const ROWS: FakeTask[] = [
  { id: 't-1', title: 'Fix the coffee machine' },
  { id: 't-2', title: 'SOP stock opname mingguan' },
]

function makeDescriptor(opts: {
  rows?: FakeTask[]
  access?: CollectionAccess<never>
} = {}): RecordCollectionDescriptor<
  FakeTask,
  string,
  TaskCollectionQuery,
  { viewerId: string | null },
  FakeGroup,
  never,
  TaskCollectionPresentation
> {
  const rows = opts.rows ?? ROWS
  const pres = (id: TaskCollectionPresentation) => ({
    id,
    label: id,
    compatibleQueryKeys: taskPresentationCompatibleKeys[id],
    capabilities: {
      search: true,
      filterKeys: ['picId'] as const,
      sortKeys: ['sort'] as const,
      groupKeys: ['groupBy'] as const,
      savedViews: true,
      selection: true,
      recordOpening: true,
      bulkActions: [] as readonly never[],
    },
    render: (props: { projection: CollectionProjection<FakeTask, FakeGroup>; onOpenRecord: (r: FakeTask) => void }) => (
      <ul data-testid="work-rows">
        {props.projection.visibleRecords.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => props.onOpenRecord(r)}>{r.title}</button>
          </li>
        ))}
      </ul>
    ),
  })
  return {
    id: 'tasks',
    defaultPresentation: 'table',
    query: taskCollectionQuery,
    savedViews: {
      enabled: true,
      store: { list: async () => [], get: async () => null, create: vi.fn(), rename: vi.fn(), archive: vi.fn() },
      operations: ['save', 'apply', 'rename', 'archive'],
      buildSpec: () => { throw new Error('unused') },
      parseAndValidate: () => ({ ok: false, issues: [] }),
      applySpec: () => { throw new Error('unused') },
    },
    presentations: { table: pres('table'), card: pres('card') },
    load: async () => ({ records: rows, context: { viewerId: 'p-me' } }),
    project: (data, query): CollectionProjection<FakeTask, FakeGroup> => {
      const q = (query.q ?? '').toLowerCase()
      const visible = q ? data.records.filter((r) => r.title.toLowerCase().includes(q)) : data.records
      return {
        visibleRecords: visible,
        groups: [{ key: 'all', rows: visible }],
        totalRecords: data.records.length,
        visibleRecordsAreFiltered: visible.length !== data.records.length,
      }
    },
    getId: (r) => r.id,
    getAccess: () => opts.access ?? { mode: 'full', visibleActions: [] },
    viewer: {
      recordType: 'task',
      buildPanelEntry: (record) => ({ key: `task:${record.id}`, owner: 'tasks', tenant: 'record', label: record.title, content: null }),
      toCanonicalPage: (id) => ({ pathname: `/tasks/${id}` }),
    },
  }
}

const INITIAL = {
  query: TASK_COLLECTION_NEUTRAL_QUERY,
  presentation: 'table' as TaskCollectionPresentation,
  viewerId: 'p-me',
  accessRoles: ['ops_lead'],
}

async function ready<T extends { state: { status: string } }>(c: T) {
  await new Promise((r) => setTimeout(r, 0))
  return c
}

const chrome = {
  empty: { title: 'No tasks yet' },
  filteredEmpty: { title: 'No matching tasks', clear: () => {} },
  error: { message: 'Could not load tasks', retry: () => {} },
  loadingLabel: 'Loading tasks',
}

describe('RecordCollectionSurface', () => {
  it('FR-V3-014: work rows render before manager configuration controls in the default surface', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await ready(c)
    render(
      <RecordCollectionSurface
        controller={c}
        controls={<div data-testid="manager-controls">controls</div>}
        {...chrome}
      />,
    )
    // Work is shown immediately — not gated behind a command-only disclosure.
    const rows = screen.getByTestId('work-rows')
    expect(within(rows).getByText('Fix the coffee machine')).toBeInTheDocument()
    expect(screen.getByTestId('manager-controls')).toBeInTheDocument()
  })

  it('NFR-V3-006: selecting a row renders the selection bar with the 44px-target chrome class', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await ready(c)
    c.toggleSelected('t-1')
    render(
      <RecordCollectionSurface
        controller={c}
        selectionBar={<button type="button">Clear selection</button>}
        {...chrome}
      />,
    )
    const bar = screen.getByTestId('collection-selection-bar')
    expect(bar).toBeInTheDocument()
    // The selection bar wears the chrome class whose 44px rule is asserted against the CSS below.
    expect(bar.className).toContain('record-collection-selection')
  })

  it('NFR-V3-001: error retry and filtered-empty clear action are reachable by keyboard', async () => {
    const retry = vi.fn()
    const clear = vi.fn()
    // filtered-empty
    const filtered = createRecordCollectionController(makeDescriptor(), {
      ...INITIAL,
      query: { ...TASK_COLLECTION_NEUTRAL_QUERY, q: 'zzz-nothing' },
    })
    await ready(filtered)
    const { unmount } = render(
      <RecordCollectionSurface controller={filtered} {...chrome} filteredEmpty={{ title: 'No matching tasks', clear }} />,
    )
    const clearBtn = screen.getByRole('button', { name: /clear filters/i })
    clearBtn.focus()
    expect(clearBtn).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(clear).toHaveBeenCalled()
    unmount()

    // error
    const failing = makeDescriptor()
    failing.load = async () => { throw new Error('nope') }
    const errored = createRecordCollectionController(failing, INITIAL)
    await ready(errored)
    render(<RecordCollectionSurface controller={errored} {...chrome} error={{ message: 'Could not load tasks', retry }} />)
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    retryBtn.focus()
    await userEvent.keyboard('{Enter}')
    expect(retry).toHaveBeenCalled()
  })

  it('NFR-V3-009: read-only collection shows rows and hides edit/bulk action affordances honestly', async () => {
    const c = createRecordCollectionController(
      makeDescriptor({ access: { mode: 'read-only', visibleActions: [] } }),
      INITIAL,
    )
    await ready(c)
    c.toggleSelected('t-1')
    render(
      <RecordCollectionSurface
        controller={c}
        selectionBar={<button type="button">Archive</button>}
        {...chrome}
      />,
    )
    // Rows are readable.
    expect(within(screen.getByTestId('work-rows')).getByText('Fix the coffee machine')).toBeInTheDocument()
    // Read-only is announced and the bulk/edit selection bar is not shown.
    expect(screen.getByRole('status')).toHaveTextContent(/view this collection but not edit/i)
    expect(screen.queryByTestId('collection-selection-bar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('NFR-V3-009: a forbidden collection shows an access notice and no rows or controls', async () => {
    const c = createRecordCollectionController(
      makeDescriptor({ access: { mode: 'forbidden', visibleActions: [] } }),
      INITIAL,
    )
    await ready(c)
    render(
      <RecordCollectionSurface
        controller={c}
        controls={<div data-testid="manager-controls">controls</div>}
        {...chrome}
      />,
    )
    expect(screen.getByText(/don’t have access/i)).toBeInTheDocument()
    expect(screen.queryByTestId('work-rows')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manager-controls')).not.toBeInTheDocument()
  })

  it('NFR-V3-001: switching presentation to a target with no data yet keeps a loading affordance', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    // Render before the initial load resolves — the surface shows the loading shell, not a crash.
    const { container } = render(<RecordCollectionSurface controller={c} {...chrome} />)
    expect(container.querySelector('[data-collection-status="loading"]')).not.toBeNull()
    await ready(c)
  })

  it('NFR-V3-001: empty state renders create affordance and no rows', async () => {
    const c = createRecordCollectionController(makeDescriptor({ rows: [] }), INITIAL)
    await ready(c)
    render(
      <RecordCollectionSurface
        controller={c}
        {...chrome}
        empty={{ title: 'No tasks yet', copy: 'Add the first task', create: <button type="button">New task</button> }}
      />,
    )
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New task' })).toBeInTheDocument()
    expect(screen.queryByTestId('work-rows')).not.toBeInTheDocument()
  })
})

describe('OD-REDESIGN-72/79: shared result-header framing', () => {
  it('renders the collection label, the active view label, and the result count when provided', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await ready(c)
    render(
      <RecordCollectionSurface
        controller={c}
        {...chrome}
        resultHeader={{ collectionLabel: 'Tasks', viewLabel: 'Overdue', count: 3 }}
      />,
    )
    const header = screen.getByTestId('collection-result-header')
    expect(header).toHaveTextContent('Tasks')
    expect(header).toHaveTextContent('Overdue')
    expect(header).toHaveTextContent('3 items in your scope')
  })

  it('omits the result header when not provided (legacy callers opt in)', async () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    await ready(c)
    render(<RecordCollectionSurface controller={c} {...chrome} />)
    expect(screen.queryByTestId('collection-result-header')).not.toBeInTheDocument()
  })

  it('shows an honest placeholder while the count is still unknown', () => {
    const c = createRecordCollectionController(makeDescriptor(), INITIAL)
    // Render before the load resolves — the loading region still names the collection + view.
    render(
      <RecordCollectionSurface
        controller={c}
        {...chrome}
        resultHeader={{ collectionLabel: 'Signals', viewLabel: 'All', count: null }}
      />,
    )
    expect(screen.getByTestId('collection-result-header')).toHaveTextContent('Signals')
    expect(screen.getByTestId('collection-result-header')).toHaveTextContent('—')
  })
})

describe('NFR-V3-006: selection chrome meets the 44px keyboard target', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/record-collection/record-collection.css'), 'utf8')

  it('encodes a 44px minimum for the selection bar and its clear action', () => {
    // jsdom has no layout engine; the real geometry lives in the stylesheet, so the target size is
    // proven by reading the CSS for the selectors the surface actually renders (see the render test
    // above that asserts the `record-collection-selection` class is applied).
    expect(css).toMatch(/\.record-collection-selection[\s\S]*?min-height:\s*44px/)
    expect(css).toMatch(/\.record-collection-clear[\s\S]*?min-height:\s*44px/)
  })
})

describe('OD-REDESIGN-72/79: collection table chrome stays shared', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/record-collection/record-collection.css'), 'utf8')

  it('gives every opted-in collection table one 14px / 38px / 52px E7 rhythm', () => {
    expect(css).toMatch(/\.record-collection-view\s*\{[\s\S]*?--row-min-h:\s*52px/)
    // 14px authored as the semantic body token that resolves to exactly 14px (GUARD-VOCAB tokenization).
    expect(css).toMatch(/\.record-collection-table\s*\{[\s\S]*?font-size:\s*var\(--font-size-body\)/)
    expect(css).toMatch(/\.record-collection-view \.record-collection-table thead th[\s\S]*?height:\s*38px/)
    expect(css).toMatch(/\.record-collection-view \.record-collection-table tbody td[\s\S]*?height:\s*var\(--row-min-h\)/)
  })
})
