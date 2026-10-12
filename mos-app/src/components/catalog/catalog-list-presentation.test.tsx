import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

function renderRows(
  rows: CatalogRow[],
  contextOverrides: Partial<CatalogCollectionContext> = {},
  locale: 'en' | 'id' = 'en',
  onOpenRecord: (row: CatalogRow) => void = () => {},
) {
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
    <I18nProvider initialLocale={locale}>
      <MemoryRouter>
        <CatalogCollectionActionsProvider actions={actions}>
          <CatalogListPresentation
            query={query}
            projection={projection}
            context={context}
            selectedIds={new Set()}
            onToggleSelected={() => {}}
            onOpenRecord={onOpenRecord}
            onToggleGroup={() => {}}
            isGroupCollapsed={() => false}
          />
        </CatalogCollectionActionsProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

function rowFor(name: string): HTMLElement {
  return screen.getByRole('link', { name }).closest('[role="row"]') as HTMLElement
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
  it('owns rows and cells through a valid table rowgroup', () => {
    const record: CatalogRow = { id: 'work-tree', name: 'Catalog tree', archived_at: null, type: 'project', accountablePersonId: 'person-1' }
    renderRows([record])

    const table = screen.getByRole('table', { name: 'Active' })
    const rowgroup = within(table).getByRole('rowgroup')
    const row = within(rowgroup).getByRole('row')
    expect(rowgroup.tagName).toBe('UL')
    expect(within(row).getAllByRole('cell').length).toBeGreaterThan(1)
    expect(within(row).getByRole('link', { name: 'Catalog tree' })).toHaveAttribute('href', '/work/projects/work-tree')
  })

  it('opens a record from another cell while keeping the name as a real link', () => {
    const record: CatalogRow = { id: 'work-click', name: 'Clickable project', archived_at: null, type: 'project', accountablePersonId: 'person-1' }
    const onOpenRecord = vi.fn()
    renderRows([record], {}, 'en', onOpenRecord)

    const row = rowFor('Clickable project')
    fireEvent.click(within(row).getByRole('cell', { name: /^Accountable:/ }))
    expect(onOpenRecord).toHaveBeenCalledWith(record)
    expect(within(row).getByRole('link', { name: 'Clickable project' })).toHaveAttribute('href', '/work/projects/work-click')
  })

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

    const row = rowFor('Quarterly launch')
    expect(row.querySelector('.catalog-collection__identity')).toHaveTextContent('Quarterly launch')
    expect(row.querySelector('.catalog-collection__row-state')).toHaveTextContent('Active')
    expect(row.querySelector('.catalog-collection__primary-action')).toHaveTextContent('View')
    expect(row.querySelector('.catalog-collection__metadata')).not.toBeNull()
    expect(row.querySelector('.catalog-collection__metadata')?.children).toHaveLength(4)
    expect(row.querySelector('.catalog-collection__cell--cadence')).toBeNull()
  })

  it('uses shared initials + first name while retaining full owner identity for assistive tech and title', () => {
    renderRows([
      { id: 'work-1', name: 'Assigned project', archived_at: null, type: 'project', accountablePersonId: 'person-1' },
    ])

    const row = rowFor('Assigned project')
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

    const row = rowFor('Unassigned project')
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

    const row = rowFor('Literal-name project')
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

    const row = rowFor('Shared project')
    const objective = within(row).getByRole('cell', { name: 'Objective: Grow revenue. Also contributes to: Improve margin' })
    expect(objective).toHaveTextContent('Also contributes to: Improve margin')
  })

  it.each([
    {
      locale: 'en' as const,
      missingValue: 'Not set',
      contribution: 'Contributes through Tasks to: Improve margin',
      cellName: 'Objective: Not set. Contributes through Tasks to: Improve margin',
    },
    {
      locale: 'id' as const,
      missingValue: 'Belum diatur',
      contribution: 'Berkontribusi melalui Tugas pada: Improve margin',
      cellName: 'Tujuan: Belum diatur. Berkontribusi melalui Tugas pada: Improve margin',
    },
  ])('shows the localized missing value beside Task-only Objective context ($locale)', ({ locale, missingValue, contribution, cellName }) => {
    const record = { id: 'work-5', name: 'Shared through tasks', archived_at: null, type: 'project' as const }
    renderRows([record, filled], relationsWithFilled([record, filled], [[record.id, {
      groups: [{ id: 'objective-2', name: 'Improve margin', relationship: 'contribution', entity: 'objective', taskCount: 1, done: 0, total: 1 }],
      tasks: [],
    }]]), locale)

    const row = rowFor('Shared through tasks')
    const objective = within(row).getByRole('cell', { name: cellName })
    expect(within(objective).getByText(missingValue, { exact: true })).toBeInTheDocument()
    expect(objective).toHaveTextContent(contribution)
    expect(objective).toHaveAccessibleName(cellName)
  })

  it('keeps direct and Task-derived Objective names together in the Objective cell', () => {
    const record = { id: 'work-7', name: 'Shared work', archived_at: null, type: 'project' as const }
    renderRows([record], {
      relationsById: new Map([[record.id, {
        groups: [
          { id: 'objective-1', name: 'Grow weekday revenue', relationship: 'direct', entity: 'objective', taskCount: 1, done: 0, total: 1 },
          { id: 'objective-2', name: 'Improve monthly average transaction value', relationship: 'contribution', entity: 'objective', taskCount: 1, done: 1, total: 1 },
        ],
        tasks: [],
      }]]),
    })

    const row = rowFor('Shared work')
    const objective = within(row).getByRole('cell', { name: /^Objective:/ })
    expect(objective).toHaveTextContent('Grow weekday revenue')
    expect(objective).toHaveTextContent('Also contributes to: Improve monthly average transaction value')
    expect(objective).toHaveAccessibleName('Objective: Grow weekday revenue. Also contributes to: Improve monthly average transaction value')
  })

  it('keeps the Objective column when a Work line has only Task-derived context', () => {
    const record = { id: 'work-indirect', name: 'Task-linked work', archived_at: null, type: 'project' as const }
    renderRows([record], {
      relationsById: new Map([[record.id, {
        groups: [{ id: 'objective-3', name: 'Reduce waste', relationship: 'contribution', entity: 'objective', taskCount: 1, done: 0, total: 1 }],
        tasks: [],
      }]]),
    })

    const row = rowFor('Task-linked work')
    const objective = within(row).getByRole('cell', { name: /^Objective:/ })
    expect(objective).toHaveTextContent('Contributes through Tasks to: Reduce waste')
  })

  it('retains the full Indonesian current-occurrence status on a narrow progress cell', () => {
    const record: CatalogRow = {
      id: 'process-long', name: 'Monthly close', type: 'process', archived_at: null,
      cadenceKind: 'monthly', cadenceActive: true,
      currentOccurrence: { run_ids: [], scheduled_date: '2026-10-01', status: 'mixed', done: 4, total: 9, pending_unresolved: 2 },
    }
    renderRows([record], {}, 'id')

    const progress = screen.getByTestId('catalog-progress')
    expect(progress).toHaveTextContent('4 / 9 selesai · 2 perlu ditetapkan')
    expect(progress).toHaveAttribute('title', '4 / 9 selesai · 2 perlu ditetapkan')
  })

  it('keeps an unlinked row at Not set without inventing a contribution', () => {
    const record = { id: 'work-6', name: 'Unlinked work', archived_at: null, type: 'project' as const }
    renderRows([record, filled], relationsWithFilled([record, filled]))

    const row = rowFor('Unlinked work')
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

  it('Objectives: leaves out Business Unit and Accountable when no row has one', () => {
    const rows: CatalogRow[] = [
      { id: 'o1', name: 'Grow revenue', archived_at: null, businessUnitId: null, accountablePersonId: null },
      { id: 'o2', name: 'Cut waste', archived_at: null, businessUnitId: null, accountablePersonId: null },
    ]
    renderRows(rows, { relationsKind: 'objective' })

    expect(screen.queryByRole('columnheader', { name: 'Business Unit' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Accountable' })).toBeNull()
    expect(screen.queryByRole('cell', { name: /^Business Unit:/ })).toBeNull()
    expect(screen.queryByRole('cell', { name: /^Accountable:/ })).toBeNull()
  })

  it('Objectives: keeps Business Unit and Accountable for every row once any row has one', () => {
    const rows: CatalogRow[] = [
      { id: 'o1', name: 'Grow revenue', archived_at: null, businessUnitId: 'bu-1', accountablePersonId: 'person-1' },
      { id: 'o2', name: 'Cut waste', archived_at: null, businessUnitId: null, accountablePersonId: null },
    ]
    renderRows(rows, { relationsKind: 'objective' })

    expect(screen.getByRole('columnheader', { name: 'Business Unit' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Accountable' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: /^Business Unit:/ })).toHaveLength(2)
    expect(screen.getAllByRole('cell', { name: /^Accountable:/ })).toHaveLength(2)
  })

  it('keeps the headers when there are no rows to judge', () => {
    renderRows([])

    expect(screen.getByRole('columnheader', { name: 'Accountable' })).toBeInTheDocument()
  })
})

describe('CatalogListPresentation Objective Business Unit cell', () => {
  const objectiveContext = { relationsKind: 'objective' as const, businessUnitsById: new Map([['bu-1', 'Retail Ops']]) }
  const cell = (name: string) => within(rowFor(name)).getByRole('cell', { name: /^Business Unit:/ })

  it('names a unit, and shows the year and quarter beside it', () => {
    renderRows([{ id: 'o1', name: 'Named', archived_at: null, businessUnitId: 'bu-1', periodYear: 2026, periodQuarter: 3 }], objectiveContext)
    expect(cell('Named')).toHaveAccessibleName('Business Unit: Retail Ops')
    expect(cell('Named')).toHaveTextContent('2026 · Q3')
  })

  it('reads Company-wide, never Not set, and is not muted', () => {
    renderRows([{ id: 'o2', name: 'Whole company', archived_at: null, businessUnitId: null, isCompanyWide: true, periodYear: 2026 }], objectiveContext)
    expect(cell('Whole company')).toHaveAccessibleName('Business Unit: Company-wide')
    expect(cell('Whole company').querySelector('.catalog-collection__cell-value--muted')).toBeNull()
    expect(cell('Whole company')).toHaveTextContent('Company-wide')
    expect(cell('Whole company')).not.toHaveTextContent('2026 ·')
  })

  it('keeps the column when the only fact is Company-wide', () => {
    renderRows([{ id: 'o5', name: 'Alone', archived_at: null, businessUnitId: null, isCompanyWide: true }], objectiveContext)
    expect(cell('Alone')).toHaveAccessibleName('Business Unit: Company-wide')
  })

  it.each([['en', 'Business Unit', 'Not set'], ['id', 'Unit Bisnis', 'Belum diatur']] as const)('shows and announces the same unset Business Unit in %s', (locale, column, missing) => {
    // a sibling with a unit keeps the column on screen (dev hides a column that is empty on every row)
    renderRows([{ id: 'o3', name: 'Unset', archived_at: null, businessUnitId: null, isCompanyWide: false }, { id: 'o4', name: 'Named', archived_at: null, businessUnitId: 'bu-1' }], objectiveContext, locale)
    const unset = within(rowFor('Unset')).getByRole('cell', { name: `${column}: ${missing}` })
    expect(within(unset).getByText(missing)).toBeVisible()
    expect(unset).not.toHaveTextContent('–')
    expect(unset.querySelector('.catalog-collection__cell-value--muted')).not.toBeNull()
  })
})

describe('CatalogListPresentation Objective Work cell', () => {
  const group = (id: string, name: string, relationship: 'direct' | 'contribution') =>
    ({ id, name, relationship, entity: 'work-line' as const, taskCount: 1, done: 0, total: 1 })
  const workCell = (name: string) => within(rowFor(name)).getByRole('cell', { name: /^Projects & Processes:/ })
  const objective = (id: string, name: string): CatalogRow => ({ id, name, archived_at: null })
  const withGroups = (rows: CatalogRow[], own: Record<string, ReturnType<typeof group>[]>) => ({
    relationsKind: 'objective' as const,
    relationsById: new Map(rows.map((row): [string, Relation] => [row.id, { groups: own[row.id] ?? [], tasks: [] }])),
  })

  it('names the direct Projects and Processes instead of counting them', () => {
    const rows = [objective('o1', 'Grow revenue')]
    renderRows(rows, withGroups(rows, { o1: [group('w1', 'Menu launch', 'direct'), group('w2', 'Daily prep', 'direct')] }))
    expect(workCell('Grow revenue')).toHaveAccessibleName('Projects & Processes: Menu launch, Daily prep')
    expect(workCell('Grow revenue')).not.toHaveTextContent(/Direct Projects|contributing/)
  })

  it.each([['en', 'Projects & Processes', 'Not set', 'Through Tasks'], ['id', 'Proyek & Proses', 'Belum diatur', 'Melalui Tugas']] as const)('shows the missing direct Work and Task contribution in %s', (locale, column, missing, throughTasks) => {
    const rows = [objective('o1', 'Grow revenue')]
    renderRows(rows, withGroups(rows, { o1: [group('w1', 'Menu launch', 'contribution')] }), locale)
    const work = within(rowFor('Grow revenue')).getByRole('cell', { name: `${column}: ${missing}. ${throughTasks}: Menu launch` })
    expect(within(work).getByText(missing)).toBeVisible()
    expect(work).toHaveTextContent(`${throughTasks}: Menu launch`)
    expect(work).not.toHaveTextContent('–')
    expect(work).not.toHaveTextContent('Linked through')
  })

  it('lists direct work and, beside it, the work reached through Tasks', () => {
    const rows = [objective('o1', 'Grow revenue')]
    renderRows(rows, withGroups(rows, { o1: [group('w1', 'Menu launch', 'direct'), group('w2', 'Daily prep', 'contribution')] }))
    expect(workCell('Grow revenue')).toHaveAccessibleName('Projects & Processes: Menu launch. Also through Tasks: Daily prep')
    expect(workCell('Grow revenue')).toHaveTextContent('Also through Tasks: Daily prep')
  })

  it.each([['en', 'Projects & Processes', 'Not set'], ['id', 'Proyek & Proses', 'Belum diatur']] as const)('shows and announces the same missing Work in %s', (locale, column, missing) => {
    const rows = [objective('o1', 'Grow revenue'), objective('o2', 'Empty')]
    renderRows(rows, withGroups(rows, { o1: [group('w1', 'Menu launch', 'direct')] }), locale)
    const work = within(rowFor('Empty')).getByRole('cell', { name: `${column}: ${missing}` })
    expect(within(work).getByText(missing)).toBeVisible()
    expect(work).not.toHaveTextContent('–')
    expect(work).not.toHaveTextContent(/\d/)
  })
})

describe('CatalogListPresentation Objective Task progress', () => {
  it('labels the Objective progress roll-up as completed Tasks', () => {
    const row: CatalogRow = { id: 'o-progress', name: 'Grow revenue', archived_at: null }
    renderRows([row], {
      relationsKind: 'objective',
      progressById: new Map([[row.id, { done: 1, total: 2 }]]),
    })
    expect(screen.getByTestId('catalog-progress')).toHaveTextContent('1 / 2 Tasks done')
  })

  it.each([
    ['en', 'No tasks linked'],
    ['id', 'Belum ada tugas yang ditautkan'],
  ] as const)('says there are no linked tasks instead of showing 0 / 0 in %s', (locale, expected) => {
    const row: CatalogRow = { id: 'o-empty-progress', name: 'Empty objective', archived_at: null }
    renderRows([row], {
      relationsKind: 'objective',
      progressById: new Map([[row.id, { done: 0, total: 0 }]]),
    }, locale)
    expect(screen.getByTestId('catalog-progress')).toHaveTextContent(expected)
    expect(screen.getByTestId('catalog-progress')).not.toHaveTextContent('0 / 0')
  })
})
