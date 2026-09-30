import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CollectionProjection } from '@/lib/record-collection/types'
import {
  CatalogCollectionActionsProvider,
  type CatalogCollectionActions,
} from './catalog-collection-actions'
import { CatalogListPresentation } from './catalog-list-presentation'
import type {
  CatalogCollectionContext,
  CatalogCollectionQuery,
  CatalogRenderGroup,
  CatalogRow,
} from './catalog-collection-adapter'

const query: CatalogCollectionQuery = {
  layout: 'list', view: 'active', q: '', type: 'all', coverage: 'all', savedViewId: null,
}

const actions: CatalogCollectionActions = {
  canManage: false,
  rename: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
}

function renderRows(rows: CatalogRow[], contextOverrides: Partial<CatalogCollectionContext> = {}) {
  const context: CatalogCollectionContext = {
    traceById: new Map(),
    relationsById: new Map(rows.map((row) => [row.id, { groups: [], tasks: [] }])),
    relationsKind: 'work_line',
    progressById: new Map(),
    peopleById: new Map([['person-1', 'Raka Utama']]),
    ...contextOverrides,
  }
  const projection: CollectionProjection<CatalogRow, CatalogRenderGroup> = {
    visibleRecords: rows,
    groups: [{ key: 'all', label: null, rows }],
    totalRecords: rows.length,
    visibleRecordsAreFiltered: false,
  }

  return render(
    <I18nProvider>
      <MemoryRouter>
        <CatalogCollectionActionsProvider actions={actions}>
          <CatalogListPresentation
            query={query}
            projection={projection}
            context={context}
            selectedIds={new Set()}
            onToggleSelected={() => {}}
            onOpenRecord={() => {}}
            onToggleGroup={() => {}}
            isGroupCollapsed={() => false}
          />
        </CatalogCollectionActionsProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// A row with an owner and an Objective. Rendered beside a row under test, it keeps those columns
// on the page (a column empty on every row is dropped), so the test still sees the gap in its row.
const filled: CatalogRow = { id: 'filled', name: 'Filled row', archived_at: null, type: 'project', accountablePersonId: 'person-1' }
const filledRelations: Array<[string, Relation]> = [['filled', {
  groups: [{ id: 'objective-9', name: 'Grow revenue', relationship: 'direct' as const, entity: 'objective' as const, taskCount: 0, done: 0, total: 0 }],
  tasks: [],
}]]

type Relation = NonNullable<ReturnType<CatalogCollectionContext['relationsById']['get']>>

function relationsWithFilled(rows: CatalogRow[], own: Array<[string, Relation]> = []) {
  return {
    relationsById: new Map([
      ...rows.filter((row) => !own.some(([id]) => id === row.id)).map((row): [string, Relation] => [row.id, { groups: [], tasks: [] }]),
      ...own,
      ...filledRelations,
    ]),
  }
}

describe('CatalogListPresentation owner-cell grammar', () => {
  it('keeps lifecycle and the row action beside identity, with all lower-priority facts grouped', () => {
    const record: CatalogRow = { id: 'work-0', name: 'Quarterly launch', archived_at: null, type: 'project', accountablePersonId: 'person-1' }
    renderRows([record], {
      relationsById: new Map([[record.id, {
        groups: [
          { id: 'objective-1', name: 'Grow revenue', relationship: 'direct', entity: 'objective', taskCount: 0, done: 0, total: 0 },
          { id: 'objective-2', name: 'Improve margin', relationship: 'contribution', entity: 'objective', taskCount: 1, done: 0, total: 1 },
        ],
        tasks: [],
      }]]),
    })

    const row = screen.getByRole('link', { name: 'Quarterly launch' })
    expect(row.querySelector('.catalog-collection__identity')).toHaveTextContent('Quarterly launch')
    expect(row.querySelector('.catalog-collection__row-state')).toHaveTextContent('Active')
    expect(row.querySelector('.catalog-collection__primary-action')).toHaveTextContent('View')
    expect(row.querySelector('.catalog-collection__metadata')).not.toBeNull()
    expect(row.querySelector('.catalog-collection__metadata')?.children).toHaveLength(5)
  })

  it('uses shared initials + first name while retaining full owner identity for assistive tech and title', () => {
    renderRows([
      { id: 'work-1', name: 'Assigned project', archived_at: null, type: 'project', accountablePersonId: 'person-1' },
    ])

    const row = screen.getByRole('link', { name: 'Assigned project' })
    const owner = within(row).getByRole('cell', { name: 'Accountable: Raka Utama' })
    expect(owner).toHaveAttribute('title', 'Raka Utama')
    expect(owner.querySelector('.ownav')).toHaveTextContent('RU')
    expect(owner.querySelector('.own-name')).toHaveTextContent('Raka')
    expect(owner).not.toHaveTextContent('Raka Utama')
  })

  it('keeps missing values accessible without repeating Not set across the visual row', () => {
    const rows: CatalogRow[] = [
      { id: 'work-2', name: 'Unassigned project', archived_at: null, type: 'project', accountablePersonId: null },
      filled,
    ]
    renderRows(rows)

    const row = screen.getByRole('link', { name: 'Unassigned project' })
    const owner = within(row).getByRole('cell', { name: 'Accountable: Not set' })
    // One word for one fact: the eye and the screen reader get the SAME word, and it names the
    // gap rather than dashing it — the same word the record's own Accountable field uses for the
    // same gap (defect 7: one ownership vocabulary, not "Owner"/"Unassigned" here and
    // "Accountable"/"Not set" there).
    expect(owner).toHaveAttribute('title', 'Not set')
    expect(owner).toHaveTextContent('Not set')
    expect(owner).not.toHaveTextContent('–')
    expect(owner.querySelector('.ownav')).toBeNull()
  })

  it('renders a real relation named Not set instead of treating its name as missing data', () => {
    const record = { id: 'work-3', name: 'Literal-name project', archived_at: null, type: 'project' as const, accountablePersonId: 'person-1' }
    renderRows([record], {
      relationsById: new Map([[record.id, {
        groups: [{ id: 'objective-1', name: 'Not set', relationship: 'direct', entity: 'objective', taskCount: 0, done: 0, total: 0 }],
        tasks: [],
      }]]),
    })

    const row = screen.getByRole('link', { name: 'Literal-name project' })
    expect(within(row).getByRole('cell', { name: 'Objective: Not set' })).toHaveTextContent('Not set')
  })

  it('keeps a stored Objective parent separate from Task-linked contributions in the list', () => {
    const record = { id: 'work-4', name: 'Shared project', archived_at: null, type: 'project' as const }
    renderRows([record], {
      relationsById: new Map([[record.id, {
        groups: [
          { id: 'objective-1', name: 'Grow revenue', relationship: 'direct', entity: 'objective', taskCount: 1, done: 0, total: 1 },
          { id: 'objective-2', name: 'Improve margin', relationship: 'contribution', entity: 'objective', taskCount: 1, done: 1, total: 1 },
        ],
        tasks: [],
      }]]),
    })

    const row = screen.getByRole('link', { name: 'Shared project' })
    expect(within(row).getByRole('cell', { name: 'Objective: Grow revenue' })).toBeInTheDocument()
    expect(row).toHaveTextContent('Also contributes to: Improve margin')
  })

  it('keeps a Task-only relationship out of the direct Objective cell', () => {
    const record = { id: 'work-5', name: 'Shared through tasks', archived_at: null, type: 'project' as const }
    renderRows([record, filled], relationsWithFilled([record, filled], [[record.id, {
      groups: [{ id: 'objective-2', name: 'Improve margin', relationship: 'contribution', entity: 'objective', taskCount: 1, done: 0, total: 1 }],
      tasks: [],
    }]]))

    const row = screen.getByRole('link', { name: 'Shared through tasks' })
    expect(within(row).getByRole('cell', { name: 'Objective: Not set' })).toBeInTheDocument()
    expect(row).toHaveTextContent('Contributes through Tasks to: Improve margin')
  })

  it('keeps an unlinked row at Not set without inventing a contribution', () => {
    const record = { id: 'work-6', name: 'Unlinked work', archived_at: null, type: 'project' as const }
    renderRows([record, filled], relationsWithFilled([record, filled]))

    const row = screen.getByRole('link', { name: 'Unlinked work' })
    expect(within(row).getByRole('cell', { name: 'Objective: Not set' })).toBeInTheDocument()
    expect(row).not.toHaveTextContent('Contributes to:')
  })

  it('leaves out a fact that is empty on every row, header and cells', () => {
    const rows: CatalogRow[] = [
      { id: 'a', name: 'Alpha', archived_at: null, type: 'project', accountablePersonId: null },
      { id: 'b', name: 'Beta', archived_at: null, type: 'project', accountablePersonId: null },
    ]
    renderRows(rows)

    expect(screen.queryByRole('columnheader', { name: 'Accountable' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Objective' })).toBeNull()
    expect(screen.queryByRole('cell', { name: /^Accountable:/ })).toBeNull()
    expect(screen.queryByRole('cell', { name: /^Objective:/ })).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Progress' })).toBeInTheDocument()
  })

  it('keeps a fact column for every row once any row has a value', () => {
    const rows: CatalogRow[] = [
      { id: 'a', name: 'Alpha', archived_at: null, type: 'project', accountablePersonId: 'person-1' },
      { id: 'b', name: 'Beta', archived_at: null, type: 'project', accountablePersonId: null },
    ]
    renderRows(rows)

    expect(screen.getByRole('columnheader', { name: 'Accountable' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: /^Accountable:/ })).toHaveLength(2)
  })

  it('keeps the headers when there are no rows to judge', () => {
    renderRows([])

    expect(screen.getByRole('columnheader', { name: 'Accountable' })).toBeInTheDocument()
  })
})
