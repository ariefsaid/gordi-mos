import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogDirectionRegister } from './catalog-direction-register'
import { CatalogCollectionActionsProvider } from './catalog-collection-actions'
import type { CatalogCollectionContext, CatalogCollectionQuery, CatalogRow } from './catalog-collection-adapter'

afterEach(cleanup)
const query: CatalogCollectionQuery = { q: '', view: 'active', type: 'all', coverage: 'all', sort: 'name', direction: 'ascending', savedViewId: null, layout: 'list' }
const item: CatalogRow = { id: 'objective-1', name: 'Operational Excellence', archived_at: null }
const context: CatalogCollectionContext = {
  relationsKind: 'objective', traceById: new Map(), progressById: new Map([['objective-1', { done: 1, total: 3 }]]),
  relationsById: new Map([['objective-1', { tasks: [], groups: [
    { id: 'direct-child', name: 'Daily opening', relationship: 'direct', entity: 'work-line', workLineId: 'process-1', taskCount: 2, total: 2, done: 1 },
    { id: 'task-child', name: 'Brand Refresh', relationship: 'contribution', entity: 'work-line', workLineId: 'project-1', taskCount: 1, total: 1, done: 0 },
  ] }]]),
}
function mount(onOpen = vi.fn()) {
  render(<MemoryRouter><CatalogCollectionActionsProvider actions={{ canManage: false, rename: vi.fn(), archive: vi.fn(), unarchive: vi.fn() }}><CatalogDirectionRegister query={query} context={context}
    projection={{ visibleRecords: [item], groups: [], totalRecords: 1, visibleRecordsAreFiltered: false }}
    selectedIds={new Set()} onToggleSelected={vi.fn()} onOpenRecord={onOpen} onToggleGroup={vi.fn()} isGroupCollapsed={() => false} /></CatalogCollectionActionsProvider></MemoryRouter>)
  return onOpen
}

describe('direction register record doors and source relationships', () => {
  it('uses the existing collection record opener for ordinary activation and preserves canonical hrefs', () => {
    const onOpen = mount()
    const identity = screen.getByRole('link', { name: item.name })
    expect(identity).toHaveAttribute('href', '/work/objectives/objective-1')
    fireEvent.click(identity)
    expect(onOpen).toHaveBeenCalledWith(item)
  })
  it('makes direct and contribution relationships real links with their distinct provenance', () => {
    mount()
    expect(screen.getByRole('link', { name: 'Daily opening' })).toHaveAttribute('href', '/work/projects/process-1')
    expect(screen.getByRole('link', { name: /Brand Refresh.*via tasks/ })).toHaveAttribute('href', '/work/projects/project-1')
    expect(screen.getByText('1 / 3 tasks done')).toBeVisible()
    expect(screen.getByText('Not set: Accountable, Period')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open record to review setup' })).toHaveAttribute('href', '/work/objectives/objective-1')
  })
})
