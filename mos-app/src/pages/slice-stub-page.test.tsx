import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ContextRow } from '@/shell/context-row'
import { SliceStubPage } from './slice-stub-page'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function renderStub(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{ui}</I18nProvider>
    </MemoryRouter>,
  )
}

describe('SliceStubPage — the placeholder for a route whose surface is not built yet', () => {
  it('names the destination and states its job, so the route is not a blank page', () => {
    renderStub(<SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Roastery' })).toBeInTheDocument()
    expect(screen.getByText(/record today.s roasts/i)).toBeInTheDocument()
  })

  it('says the slice is not built — never that the page does not exist', () => {
    // The distinction the component exists for. A 404 tells a viewer the rail lied to them; this
    // tells them the destination is real and the work is queued.
    renderStub(<SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />)

    const empty = screen.getByTestId('empty-state')
    expect(empty).toHaveAttribute('data-empty-variant', 'blank')
    expect(screen.getByRole('heading', { level: 2, name: /not in this slice yet/i })).toBeInTheDocument()
    expect(screen.getByText(/ecommerce lands in a later build step/i)).toBeInTheDocument()
    expect(screen.queryByText(/does not exist|not found/i)).not.toBeInTheDocument()
  })

  it('sets the document title from the destination name', () => {
    renderStub(<SliceStubPage jobKey="job.events" nameKey="dest.events" />)
    expect(document.title).toBe('Events — Gordi MOS')
  })

  it('renders in the record family when the route is a record door', () => {
    const { container } = renderStub(
      <SliceStubPage jobKey="job.signals" nameKey="nav.work.signals" family="focused-record" />,
    )
    expect(container.querySelector('[data-page-family="focused-record"]')).not.toBeNull()
  })
})

// #199 owns Ecommerce and Roastery, and their answer is "stay on the stub". That is still a claim
// about what a viewer sees, so it is asserted rather than assumed — including the half that the
// component-only cases above cannot see. `SliceStubPage` renders a `PageFamilyFrame`, whose page
// head emits the job sentence; the shell's `ContextRow` emits it too unless the route is in the
// page-family-migration registry. Mounting the page WITHOUT the shell hides that entirely, which
// is why every case above passed while `/ecommerce` printed its job sentence twice.
describe('PORT-024: the Ecommerce and Roastery stubs, mounted under the shell context row', () => {
  beforeEach(() => {
    localStorage.setItem('mos.locale', 'en')
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: '40000000-0000-0000-0000-000000000001',
          org_id: '10000000-0000-0000-0000-000000000001',
          user_id: 'auth-user-001',
          full_name: 'Cahya Cafe',
          email: 'cahya@example.test',
          must_change_password: false,
          archived_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        roles: [],
        isManager: false,
        accessRoles: [],
      },
      signOut: vi.fn(),
    })
  })

  const cases = [
    {
      path: '/ecommerce',
      name: 'Ecommerce',
      job: "Fulfil today's online orders against the right stock.",
    },
    {
      path: '/roastery',
      name: 'Roastery',
      job: 'Record today’s roasts, yield, and transfers truthfully.',
    },
  ] as const

  it.each(cases)('$path names its destination and shows no not-found', ({ path, name }) => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <ContextRow />
          <SliceStubPage
            jobKey={path === '/ecommerce' ? 'job.ecommerce' : 'job.roastery'}
            nameKey={path === '/ecommerce' ? 'dest.ecommerce' : 'dest.roastery'}
          />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name })).toBeInTheDocument()
    expect(screen.queryByText(/does not exist|not found|page you asked for/i)).not.toBeInTheDocument()
  })

  it.each(cases)('$path shows its job sentence exactly once, not twice', ({ path, job }) => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <ContextRow />
          <SliceStubPage
            jobKey={path === '/ecommerce' ? 'job.ecommerce' : 'job.roastery'}
            nameKey={path === '/ecommerce' ? 'dest.ecommerce' : 'dest.roastery'}
          />
        </MemoryRouter>
      </I18nProvider>,
    )
    // queryAllByText, not getByText: `getByText` throwing on a second match reports "found
    // multiple elements", which reads as a broken query rather than as a duplicated sentence.
    expect(screen.queryAllByText(job)).toHaveLength(1)
  })
})
