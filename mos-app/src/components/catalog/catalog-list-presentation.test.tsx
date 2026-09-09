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

function renderRows(rows: CatalogRow[]) {
  const context: CatalogCollectionContext = {
    traceById: new Map(),
    relationsById: new Map(rows.map((row) => [row.id, { groups: [], tasks: [] }])),
    relationsKind: 'work_line',
    progressById: new Map(),
    peopleById: new Map([['person-1', 'Raka Utama']]),
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

describe('CatalogListPresentation owner-cell grammar', () => {
  it('uses shared initials + first name while retaining full owner identity for assistive tech and title', () => {
    renderRows([
      { id: 'work-1', name: 'Assigned project', archived_at: null, type: 'project', accountablePersonId: 'person-1' },
    ])

    const row = screen.getByRole('link', { name: 'Assigned project' })
    const owner = within(row).getByRole('cell', { name: 'Owner: Raka Utama' })
    expect(owner).toHaveAttribute('title', 'Raka Utama')
    expect(owner.querySelector('.ownav')).toHaveTextContent('RU')
    expect(owner.querySelector('.own-name')).toHaveTextContent('Raka')
    expect(owner).not.toHaveTextContent('Raka Utama')
  })

  it('keeps an explicit Not set owner state without inventing an avatar', () => {
    renderRows([
      { id: 'work-2', name: 'Unassigned project', archived_at: null, type: 'project', accountablePersonId: null },
    ])

    const row = screen.getByRole('link', { name: 'Unassigned project' })
    const owner = within(row).getByRole('cell', { name: 'Owner: Not set' })
    expect(owner).toHaveAttribute('title', 'Not set')
    expect(owner).toHaveTextContent('Not set')
    expect(owner.querySelector('.ownav')).toBeNull()
  })
})
