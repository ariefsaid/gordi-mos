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
  CatalogRecordDocument: ({ id }: { id: string }) => <p>record body {id}</p>,
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
})
