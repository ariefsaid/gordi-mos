// The shared record-panel chrome names the record kind — never the generic "Project / Process"
// placeholder when the real type is already known.
import { describe, it, expect, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider } from '@/shell/overlay-host'
import { useCatalogRecordEntryFactory, useCatalogRecordOverlay } from './use-catalog-record-overlay'

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

describe('useCatalogRecordEntryFactory — panel chrome label', () => {
  it('names a Process record "Process", not the generic placeholder', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work', resolveType: () => 'process' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('work-line', 'wl-1')
    expect(entry.label).toBe('Process')
    expect(entry.title).toBe('Process')
  })

  it('names a Project record "Project"', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work', resolveType: () => 'project' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('work-line', 'wl-1')
    expect(entry.label).toBe('Project')
  })

  it('names an Objective record "Objective" regardless of resolveType', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('objective', 'obj-1')
    expect(entry.label).toBe('Objective')
  })

  it('opens the full page without the collection\'s layout param (a phone list layout is not a page setting)', () => {
    const { result } = renderHook(() => useCatalogRecordEntryFactory({ owner: 'work' }), { wrapper })
    expect(result.current.buildEntry('objective', 'o1', '?layout=list&view=all').pageTo).toEqual({ pathname: '/work/objectives/o1', search: '?view=all' })
    expect(result.current.buildEntry('work-line', 'w1', '?layout=list').pageTo).toEqual({ pathname: '/work/projects/w1', search: '' })
  })

  it('falls back to the generic placeholder only when the type is not yet known (cold deep link)', () => {
    const { result } = renderHook(
      () => useCatalogRecordEntryFactory({ owner: 'work' }),
      { wrapper },
    )
    const entry = result.current.buildEntry('work-line', 'wl-1')
    expect(entry.label).toBe('Project / Process')
  })
})

// ── The URL decides which catalog record is open ────────────────────────────────────────────
vi.mock('./catalog-record-document', () => ({
  CatalogRecordDocument: ({ id, onCreateTask, taskAddedRef }: { id: string; onCreateTask?: (workLineId: string) => void; taskAddedRef?: { current: boolean } }) => (
    <>
      <p>record body {id}</p>
      <button type="button" onClick={() => onCreateTask?.('wl-1')}>mock add task</button>
      <output>{taskAddedRef?.current ? 'task was added' : ''}</output>
    </>
  ),
}))
vi.mock('./catalog-task-create-session', () => ({
  createCatalogTaskCreateSession: () => ({ dirty: false, guard: async () => ({ decision: 'allow' }) }),
}))
vi.mock('./catalog-task-create-frame', () => ({
  CatalogTaskCreateFrame: ({ workLineId, onCreated, onLeave }: { workLineId: string; onCreated: (id: string) => void; onLeave: () => void }) => (
    <div>
      <p>create frame for {workLineId}</p>
      <button type="button" onClick={() => onCreated('t-new')}>mock save</button>
      <button type="button" onClick={onLeave}>mock cancel</button>
    </div>
  ),
}))
vi.mock('@/components/tasks/task-drawer', () => ({ TaskOverlayContent: () => null }))

function Collection() {
  const overlay = useCatalogRecordOverlay({ collectionKind: 'objective', onCollectionChanged: () => {} })
  return (
    <>
      <a className="catalog-collection__row-link" href="/mos/work/objectives/o1">Objective one</a>
      {overlay.slot}
    </>
  )
}

function renderCollection(initialEntries: string[], initialIndex: number) {
  const router = createMemoryRouter(
    [{ path: '*', element: <I18nProvider><OverlayHostProvider><Collection /></OverlayHostProvider></I18nProvider> }],
    { initialEntries, initialIndex },
  )
  render(<RouterProvider router={router} />)
  return router
}

const RECORD_URL = '/work/objectives?record=o1&recordType=objective'

describe('useCatalogRecordOverlay — URL-owned record state', () => {
  it('Forward onto a record entry after Back past it keeps the record in the URL and open', async () => {
    const router = renderCollection(['/work/objectives', RECORD_URL], 1)
    await screen.findByText('record body o1')

    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByText('record body o1')).toBeNull())
    await act(() => router.navigate(1))

    await screen.findByText('record body o1')
    expect(router.state.location.search).toContain('record=o1')
  })

  it('closing a record the URL opened returns focus to that record’s row', async () => {
    const router = renderCollection([RECORD_URL], 0)
    await screen.findByText('record body o1')

    await act(async () => { screen.getByRole('button', { name: 'Close' }).click() })

    await waitFor(() => expect(screen.getByRole('link', { name: 'Objective one' })).toHaveFocus())
    expect(router.state.location.search).not.toContain('record=')
  })

  it('Add task opens the create frame on the same panel stack, without leaving the page, and saving pops back to the record', async () => {
    const router = renderCollection([RECORD_URL], 0)
    await screen.findByText('record body o1')
    const before = router.state.location.pathname

    await act(async () => { screen.getByRole('button', { name: 'mock add task' }).click() })
    await screen.findByText('create frame for wl-1')
    expect(screen.queryByText('record body o1')).toBeNull()
    expect(router.state.location.pathname).toBe(before)

    await act(async () => { screen.getByRole('button', { name: 'mock save' }).click() })
    await screen.findByText('record body o1')
    expect(screen.getByRole('status')).toHaveTextContent('task was added')
  })

  it('Cancel on the create frame goes back to the record with nothing added', async () => {
    renderCollection([RECORD_URL], 0)
    await screen.findByText('record body o1')
    await act(async () => { screen.getByRole('button', { name: 'mock add task' }).click() })
    await screen.findByText('create frame for wl-1')
    await act(async () => { screen.getByRole('button', { name: 'mock cancel' }).click() })
    await screen.findByText('record body o1')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
