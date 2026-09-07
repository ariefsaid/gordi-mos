import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

// Ticket #813 / AC-048 / AC-052 / AC-053: the Objective record surface at
// `/work/objectives/:id`. The record owns its own not-found (INSIDE the record frame
// with `‹ Back to Objectives`) and the loading/error states its DAL exposes. The
// full pinned header + Details / Projects & Processes / Tasks / Activity tabs ride
// the follow-up ticket; this page proves the ROUTING half (deep-link → RecordViewer
// frame) that AC-048 measures.
//
// The `readObjective` DAL is mocked so the page test stays a unit test — its
// behaviour (SELECT columns, PostgREST error mapping, RLS-hides-as-null) is proved
// in the objectives.test.ts sibling.

vi.mock('@/lib/db/objectives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/objectives')>()
  return { ...actual, readObjective: vi.fn() }
})
import { readObjective } from '@/lib/db/objectives'
import { ObjectiveRecordPage } from './objective-record-page'

const readObjectiveMock = vi.mocked(readObjective)

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <I18nProvider>
        <Routes>
          <Route path="/work/objectives/:id" element={<ObjectiveRecordPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => localStorage.clear())

describe('AC-048 (#813): the record surface renders inside its own frame with a Back to the collection', () => {
  it('renders the shared record-page chrome — a Back to Objectives link — around whatever body state is showing', async () => {
    // The Back is what makes the not-found feel like a MISS inside the collection
    // rather than the app-wide 404 catch-all. It must render regardless of the
    // record's load state, so the viewer always has a rendered way out.
    readObjectiveMock.mockResolvedValue(null)
    renderAt('/work/objectives/obj-missing')

    const back = await screen.findByRole('link', { name: /Objectives/ })
    expect(back).toHaveAttribute('href', '/work/objectives')
  })

  it('an unknown id resolves to a not-found INSIDE the record frame — never bounces to the app catch-all', async () => {
    readObjectiveMock.mockResolvedValue(null)
    renderAt('/work/objectives/obj-missing')

    expect(await screen.findByText('Objective not found')).toBeInTheDocument()
    expect(
      screen.getByText("This record doesn't exist or you don't have access."),
    ).toBeInTheDocument()
    // The app-wide "That page isn't here" copy is the sibling NotFoundPage's — it
    // must never render in this frame, or the surface has silently fallen through
    // the router.
    expect(screen.queryByText('That page isn’t here')).toBeNull()
  })
})

describe('AC-048 (#813): the record header names the loaded row', () => {
  it('renders the record name as the surface h1', async () => {
    readObjectiveMock.mockResolvedValue({
      id: 'obj-1',
      name: 'Grow revenue',
      archived_at: null,
      business_unit_id: 'bu-retail',
      accountable_person_id: 'p-cahya',
      period_year: 2026,
      description: null,
      updated_at: '2026-09-01T00:00:00Z',
    })
    renderAt('/work/objectives/obj-1')

    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Grow revenue')
    const article = screen.getByTestId('objective-record')
    expect(article).toHaveAttribute('data-objective-id', 'obj-1')
  })

  it('sets the document title to the record name', async () => {
    readObjectiveMock.mockResolvedValue({
      id: 'obj-2',
      name: 'Delight guests',
      archived_at: null,
      business_unit_id: null,
      accountable_person_id: null,
      period_year: null,
      description: null,
      updated_at: '2026-09-01T00:00:00Z',
    })
    renderAt('/work/objectives/obj-2')

    await waitFor(() => expect(document.title).toBe('Delight guests — Gordi MOS'))
  })

  it('surfaces a DAL error via the shared error state — the not-found and error branches are distinct', async () => {
    readObjectiveMock.mockRejectedValue(new Error('readObjective failed — timeout'))
    renderAt('/work/objectives/obj-1')

    // role=alert is what error-state renders; the record's not-found is not an
    // error (an unknown id is a legitimate answer), so it never uses this role.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('readObjective failed — timeout')
  })
})

describe('AC-053 (#813) locale parity: the record surface is keyed for both locales', () => {
  it('renders Indonesian copy for not-found and Back-to-collection under the id locale', async () => {
    localStorage.setItem('mos.locale', 'id')
    readObjectiveMock.mockResolvedValue(null)
    renderAt('/work/objectives/obj-missing')

    expect(await screen.findByText('Sasaran tidak ditemukan')).toBeInTheDocument()
    // AC-053: the ID word for Objective is one and the same across surfaces — the
    // rail says "Sasaran", the collection page says "Sasaran", and so does this
    // record's Back-to-collection link.
    expect(screen.getByRole('link', { name: /Sasaran/ })).toHaveAttribute('href', '/work/objectives')
  })
})
