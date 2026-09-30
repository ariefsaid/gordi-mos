// Column-structure equivalence for the catalog list: which headers render, in what order and
// with which hook classes, and how many cells each row carries, for every combination of the
// hide-when-empty columns (Projects & Processes and Objectives).
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CollectionProjection } from '@/lib/record-collection/types'
import { CatalogCollectionActionsProvider } from './catalog-collection-actions'
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
type Relation = NonNullable<ReturnType<CatalogCollectionContext['relationsById']['get']>>

function renderList(
  rows: CatalogRow[],
  relations: Array<[string, Relation]> = [],
  overrides: Partial<CatalogCollectionContext> = {},
) {
  const context: CatalogCollectionContext = {
    traceById: new Map(),
    relationsById: new Map([...rows.map((row): [string, Relation] => [row.id, { groups: [], tasks: [] }]), ...relations]),
    relationsKind: 'work_line',
    progressById: new Map(),
    peopleById: new Map([['person-a', 'Person A']]),
    businessUnitsById: new Map([['bu-1', 'Unit One']]),
    ...overrides,
  }
  const projection: CollectionProjection<CatalogRow, CatalogRenderGroup> = {
    visibleRecords: rows, groups: [{ key: 'all', label: null, rows }], totalRecords: rows.length,
    visibleRecordsAreFiltered: false,
  }
  return render(
    <I18nProvider>
      <MemoryRouter>
        <CatalogCollectionActionsProvider actions={{ canManage: false, rename: vi.fn(), archive: vi.fn(), unarchive: vi.fn() }}>
          <CatalogListPresentation
            query={query} projection={projection} context={context} selectedIds={new Set()}
            onToggleSelected={() => {}} onOpenRecord={() => {}} onToggleGroup={() => {}}
            isGroupCollapsed={() => false}
          />
        </CatalogCollectionActionsProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

const headers = () => screen.getAllByRole('columnheader').map((h) => [h.textContent, h.className])
const table = () => screen.getByRole('table')
const metaCells = (row: HTMLElement) =>
  Array.from(row.querySelector('.catalog-collection__metadata')!.children).map((c) => c.className)

const REL = 'catalog-collection__header-cell--relation'
const OWN = 'catalog-collection__header-cell--owner'
const CAD = 'catalog-collection__header-cell--cadence'
const PRG = 'catalog-collection__header-cell--progress'
const ACT = 'catalog-collection__header-cell--activity'

// One row per fact, so each of the three optional columns can be switched on independently.
const relationRow: CatalogRow = { id: 'r', name: 'Has objective', archived_at: null, type: 'project' }
const ownerRow: CatalogRow = { id: 'o', name: 'Has owner', archived_at: null, type: 'project', accountablePersonId: 'person-a' }
const cadenceRow: CatalogRow = { id: 'c', name: 'Has cadence', archived_at: null, type: 'process', cadenceKind: 'weekly', cadenceActive: true }
const bareRow: CatalogRow = { id: 'b', name: 'Bare', archived_at: null, type: 'project' }
const direct: Relation = {
  groups: [{ id: 'obj-1', name: 'Grow', relationship: 'direct', entity: 'objective', taskCount: 0, done: 0, total: 0 }],
  tasks: [],
}

const COMBOS = [
  { rel: true, own: true, cad: true },
  { rel: true, own: true, cad: false },
  { rel: true, own: false, cad: true },
  { rel: true, own: false, cad: false },
  { rel: false, own: true, cad: true },
  { rel: false, own: true, cad: false },
  { rel: false, own: false, cad: true },
  { rel: false, own: false, cad: false },
]

describe('catalog list column structure — Projects & Processes', () => {
  it.each(COMBOS)('headers and cells for relation=$rel owner=$own cadence=$cad', ({ rel, own, cad }) => {
    const rows = [bareRow, ...(rel ? [relationRow] : []), ...(own ? [ownerRow] : []), ...(cad ? [cadenceRow] : [])]
    renderList(rows, rel ? [['r', direct]] : [])

    const expected: string[][] = [['Name', '']]
    if (rel) expected.push(['Objective', REL])
    if (own) expected.push(['Accountable', OWN])
    if (cad) expected.push(['Cadence · due', CAD])
    expected.push(['Progress', PRG], ['Last activity', ACT])
    expect(headers()).toEqual(expected)

    expect(table().className).toBe(
      'catalog-collection__table catalog-collection__table--work_line'
      + (rel ? '' : ' catalog-collection__table--no-relation')
      + (own ? '' : ' catalog-collection__table--no-owner')
      + (cad ? '' : ' catalog-collection__table--no-cadence'),
    )

    const cellClasses = [
      ...(rel ? ['catalog-collection__cell catalog-collection__cell--relation'] : []),
      ...(own ? ['catalog-collection__cell catalog-collection__cell--owner'] : []),
      ...(cad ? ['catalog-collection__cell catalog-collection__cell--cadence'] : []),
      'catalog-collection__cell catalog-collection__cell--progress',
      'catalog-collection__cell catalog-collection__cell--activity',
    ]
    for (const link of screen.getAllByRole('link')) {
      const row = link.closest('li') as HTMLElement
      expect(metaCells(row)).toEqual(cellClasses)
      // identity + one cell per visible metadata column
      expect(row.querySelectorAll('[role="cell"]')).toHaveLength(1 + cellClasses.length)
    }
  })

  it('keeps every header, in order, when there are no rows', () => {
    renderList([])
    expect(headers()).toEqual([
      ['Name', ''], ['Objective', REL], ['Accountable', OWN], ['Cadence · due', CAD], ['Progress', PRG], ['Last activity', ACT],
    ])
    expect(table().className).toBe('catalog-collection__table catalog-collection__table--work_line')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('renders the phone-card row anatomy: identity, view action, then grouped metadata', () => {
    renderList([ownerRow])
    const link = screen.getByRole('link', { name: 'Has owner' })
    expect(link).toHaveAttribute('href', '/work/projects/o')
    expect(link.className).toBe('catalog-collection__row-link')
    expect(Array.from(link.children).map((c) => c.className)).toEqual([
      'catalog-collection__identity', 'catalog-collection__primary-action', 'catalog-collection__metadata',
    ])
    expect(link.closest('li')).toHaveAttribute('data-catalog-row-id', 'o')
  })
})

describe('catalog list column structure — Objectives', () => {
  const objective = { relationsKind: 'objective' as const }
  const withBu: CatalogRow = { id: 'b1', name: 'Has unit', archived_at: null, businessUnitId: 'bu-1' }
  const withOwner: CatalogRow = { id: 'b2', name: 'Has owner', archived_at: null, accountablePersonId: 'person-a' }
  const withWork: CatalogRow = { id: 'b3', name: 'Has work', archived_at: null }
  const bare: CatalogRow = { id: 'b4', name: 'Bare', archived_at: null }
  const work: Relation = {
    groups: [{ id: 'wl-1', name: 'Launch', relationship: 'direct', entity: 'work-line', taskCount: 0, done: 0, total: 0 }],
    tasks: [],
  }

  it.each(COMBOS)('headers and cells for unit=$rel owner=$own work=$cad', ({ rel, own, cad }) => {
    const rows = [bare, ...(rel ? [withBu] : []), ...(own ? [withOwner] : []), ...(cad ? [withWork] : [])]
    renderList(rows, cad ? [['b3', work]] : [], objective)

    const expected: string[][] = [['Name', '']]
    if (rel) expected.push(['Business Unit', REL])
    if (own) expected.push(['Accountable', OWN])
    if (cad) expected.push(['Projects & Processes', CAD])
    expected.push(['Progress', PRG], ['Last activity', ACT])
    expect(headers()).toEqual(expected)
    expect(table().className).toBe(
      'catalog-collection__table catalog-collection__table--objective'
      + (rel ? '' : ' catalog-collection__table--no-relation')
      + (own ? '' : ' catalog-collection__table--no-owner')
      + (cad ? '' : ' catalog-collection__table--no-cadence'),
    )
    const count = 2 + [rel, own, cad].filter(Boolean).length
    for (const link of screen.getAllByRole('link')) {
      expect(metaCells(link.closest('li') as HTMLElement)).toHaveLength(count)
      expect(link.closest('li')!.querySelectorAll('[role="cell"]')).toHaveLength(1 + count)
    }
  })
})
