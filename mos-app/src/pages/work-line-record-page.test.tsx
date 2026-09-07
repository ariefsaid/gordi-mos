import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

// Ticket #806 / AC-018 / AC-019: the Project/Process record surface at `/work/projects/:id`.
// The record owns its own not-found (INSIDE the record frame with `‹ Back to Projects &
// Processes`) and the loading/error states its DAL exposes. The full pinned header +
// Details/Tasks/Activity tabs ride the follow-up ticket; this page proves the ROUTING
// half (deep-link → RecordViewer frame) that AC-018 measures.
//
// The `readWorkLine` DAL is mocked so the page test stays a unit test — its behaviour
// (SELECT columns, PostgREST error mapping, RLS-hides-as-null) is proved in the
// work-lines.test.ts sibling.

vi.mock('@/lib/db/work-lines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/work-lines')>()
  return { ...actual, readWorkLine: vi.fn() }
})
import { readWorkLine } from '@/lib/db/work-lines'
import { WorkLineRecordPage } from './work-line-record-page'

const readWorkLineMock = vi.mocked(readWorkLine)

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <I18nProvider>
        <Routes>
          <Route path="/work/projects/:id" element={<WorkLineRecordPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => localStorage.clear())

describe('AC-018 (#806): the record surface renders inside its own frame with a Back to the collection', () => {
  it('renders the shared record-page chrome — a Back to Projects & Processes link — around whatever body state is showing', async () => {
    // The Back is what makes the not-found feel like a MISS inside the collection rather
    // than the app-wide 404 catch-all (AC-018 wording). It must render regardless of the
    // record's load state, so the viewer always has a rendered way out.
    readWorkLineMock.mockResolvedValue(null)
    renderAt('/work/projects/wl-missing')

    const back = await screen.findByRole('link', { name: /Projects & Processes/ })
    expect(back).toHaveAttribute('href', '/work/projects')
  })

  it('an unknown id resolves to a not-found INSIDE the record frame — never bounces to the app catch-all', async () => {
    readWorkLineMock.mockResolvedValue(null)
    renderAt('/work/projects/wl-missing')

    // The not-found copy is the RECORD's, keyed distinctly from `notFound.title` so the
    // two states can never share copy or be mistaken for each other.
    expect(await screen.findByText('Project or process not found')).toBeInTheDocument()
    expect(screen.getByText("This record doesn't exist or you don't have access.")).toBeInTheDocument()
    // The app-wide "That page isn't here" copy is the sibling NotFoundPage's — it must
    // never render in this frame, or the surface has silently fallen through the router.
    expect(screen.queryByText('That page isn’t here')).toBeNull()
  })
})

describe('AC-019 (#806): the record header names the loaded row and its type', () => {
  it('renders the record name as the surface h1 and the type label beside it', async () => {
    readWorkLineMock.mockResolvedValue({
      id: 'wl-1',
      name: 'Café Opening',
      type: 'process',
      objective_id: null,
      business_unit_id: 'bu-retail',
      accountable_person_id: 'p-cahya',
      responsible_person_id: 'p-cahya',
      archived_at: null,
      updated_at: '2026-09-01T00:00:00Z',
    })
    renderAt('/work/projects/wl-1')

    // The page's h1 is the record NAME, not a generic surface label — a viewer arriving on
    // this URL sees which record the frame is holding without opening any tab.
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Café Opening')
    expect(screen.getByText('Process')).toBeInTheDocument()
    // Data attributes are the stable oracle a later Tasks-tab or panel-stack integration
    // can key off, without our tests coupling to interior markup.
    const article = screen.getByTestId('work-line-record')
    expect(article).toHaveAttribute('data-work-line-type', 'process')
    expect(article).toHaveAttribute('data-work-line-id', 'wl-1')
  })

  it('sets the document title to the record name', async () => {
    readWorkLineMock.mockResolvedValue({
      id: 'wl-2',
      name: 'Brand Refresh',
      type: 'project',
      objective_id: 'ob-9',
      business_unit_id: null,
      accountable_person_id: null,
      responsible_person_id: null,
      archived_at: null,
      updated_at: '2026-09-01T00:00:00Z',
    })
    renderAt('/work/projects/wl-2')

    await waitFor(() => expect(document.title).toBe('Brand Refresh — Gordi MOS'))
  })

  it('surfaces a DAL error via the shared error state — the not-found and error branches are distinct', async () => {
    readWorkLineMock.mockRejectedValue(new Error('readWorkLine failed — timeout'))
    renderAt('/work/projects/wl-1')

    // role=alert is what error-state renders; the record's not-found is not an error
    // (an unknown id is a legitimate answer), so it never uses this role.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('readWorkLine failed — timeout')
  })
})

describe('AC-024 (#806) locale parity: the record surface is keyed for both locales', () => {
  it('renders Indonesian copy for not-found and Back-to-collection under the id locale', async () => {
    localStorage.setItem('mos.locale', 'id')
    readWorkLineMock.mockResolvedValue(null)
    renderAt('/work/projects/wl-missing')

    expect(await screen.findByText('Proyek atau proses tidak ditemukan')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Proyek & Proses/ })).toHaveAttribute('href', '/work/projects')
  })

  it('renders the type label localized (Proses / Proyek)', async () => {
    localStorage.setItem('mos.locale', 'id')
    readWorkLineMock.mockResolvedValue({
      id: 'wl-1',
      name: 'Pembukaan Kafe',
      type: 'process',
      objective_id: null,
      business_unit_id: null,
      accountable_person_id: null,
      responsible_person_id: null,
      archived_at: null,
      updated_at: '2026-09-01T00:00:00Z',
    })
    renderAt('/work/projects/wl-1')

    expect(await screen.findByText('Proses')).toBeInTheDocument()
    expect(screen.queryByText('Process')).toBeNull()
  })
})
