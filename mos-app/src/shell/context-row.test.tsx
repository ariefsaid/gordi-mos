import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ContextRow } from './context-row'
import { PageHead } from './page-head'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

function setAuth(accessRoles: string[] = []) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Cahya Cafe',
        email: 'cahya@gordi.id', archived_at: null, created_at: '', updated_at: '',
      },
      roles: [{ id: 'r1', org_id: 'o1', business_unit_id: 'bu-cafe', name: 'Barista', reports_to_role_id: null, created_at: '', updated_at: '' }],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  })
}

function renderCtx(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<ContextRow />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// Full anatomy render: region 2 (ContextRow) above region 3 (PageHead), exactly as a migrated
// PageFamilyFrame route composes them. Used to prove the job sentence is shown EXACTLY ONCE and
// owned by region 3 (ContextRow suppresses region 2) on migrated routes.
function renderMigratedPage(path: string, title: string, jobSentence: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ContextRow />
                <PageHead family="workspace" variant="content" title={title} jobSentence={jobSentence} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth([])
})

describe('AC-013/020 (T13): ContextRow — region + job sentence + scope', () => {
  it('renders a region labelled "Context" with data-anatomy=context-row', () => {
    renderCtx('/')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region).toHaveAttribute('data-anatomy', 'context-row')
  })

  it('AC-013 / R-OWNER-1: the Home job sentence is shown exactly once, owned by region 3 at the migrated / route', () => {
    // `/` migrated onto a PageFamilyFrame (Issue 11) whose region-3 PageHead owns the sentence, so
    // ContextRow (region 2) must suppress its copy — the page still shows the sentence exactly once.
    renderMigratedPage('/', 'Home', 'What needs my attention right now?')
    expect(screen.getAllByText('What needs my attention right now?')).toHaveLength(1)
  })

  it('R-OWNER-1: suppresses the Home job sentence in ContextRow at the migrated / route', () => {
    renderCtx('/')
    expect(screen.queryByText('What needs my attention right now?')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Signals job sentence at the migrated /work/signals route (region 3 owns it)', () => {
    // Signals migrated onto PageFamilyFrame (the Luna single-job-sentence correction): the archive's
    // region-3 page head owns the sentence, so ContextRow must NOT emit a duplicate copy.
    renderCtx('/work/signals')
    expect(screen.queryByText('Search and revisit the Signals your Teams have shared.')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Signals job sentence at the migrated record route /work/signals/:id', () => {
    renderCtx('/work/signals/sig-1')
    expect(screen.queryByText('Search and revisit the Signals your Teams have shared.')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Tasks job sentence at the migrated /work/tasks route (region 3 owns it)', () => {
    renderCtx('/work/tasks')
    expect(screen.queryByText('Find and do the work I own or my Team owns.')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the job sentence at the migrated record route /work/tasks/:id', () => {
    renderCtx('/work/tasks/abc')
    expect(screen.queryByText('Find and do the work I own or my Team owns.')).not.toBeInTheDocument()
  })

  it('AC-013 / R-OWNER-1: the Money job sentence is shown exactly once, owned by region 3 at the migrated /money route', () => {
    // `/money` migrated onto a PageFamilyFrame (Issue 11); region-3 PageHead owns the sentence.
    renderMigratedPage('/money', 'Money', 'Trust the financial figures and act on money exceptions.')
    expect(screen.getAllByText('Trust the financial figures and act on money exceptions.')).toHaveLength(1)
  })

  it('AC-013: shows the viewer scope signal, not the viewer name, in the context row (unmigrated route)', () => {
    // owner-eyes item 8: the scope crumb is suppressed on migrated routes whose head carries context,
    // so the scope-signal behavior is asserted on an unmigrated route where ContextRow is the sole owner.
    renderCtx('/admin/roles')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Café')
    expect(region.textContent).not.toContain('Cahya')
  })

  it('F3/P1: an admin-flagged viewer whose role matches no BU-family keyword shows their real role name, never the bare "Admin" label', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Dewi Director',
          email: 'dewi@gordi.id', archived_at: null, created_at: '', updated_at: '',
        },
        roles: [{ id: 'r0', org_id: 'o1', business_unit_id: null, name: 'Managing Director', reports_to_role_id: null, created_at: '', updated_at: '' }],
        isManager: true,
        accessRoles: ['admin'],
      },
      signOut: vi.fn(),
    })
    renderCtx('/admin/roles')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Managing Director')
    expect(region.textContent).not.toBe('Admin')
    expect(screen.queryByText('Admin', { exact: true })).not.toBeInTheDocument()
  })

  it('F3/P1: a viewer whose role matches no BU-family keyword shows their real role name, not a generic "Team" placeholder', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: {
          id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'Sari Sales',
          email: 'sari@gordi.id', archived_at: null, created_at: '', updated_at: '',
        },
        roles: [{ id: 'r4', org_id: 'o1', business_unit_id: 'bu-b2b-sales', name: 'Sales Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
        isManager: false,
        accessRoles: [],
      },
      signOut: vi.fn(),
    })
    renderCtx('/admin/roles')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Sales Lead')
  })
})

describe('R-OWNER-1: ContextRow job sentence is suppressed on migrated V3 page-family routes', () => {
  it('renders the job sentence exactly once on a migrated route (PageHead region 3 owns it, ContextRow region 2 suppresses)', () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/work/tasks']}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <ContextRow />
                  <PageHead
                    family="workspace"
                    variant="content"
                    title="Tasks"
                    jobSentence="Find and do the work I own or my Team owns."
                  />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    // Region 3's PageHead is the single owner of the sentence; ContextRow adds no second copy.
    expect(screen.getAllByText('Find and do the work I own or my Team owns.')).toHaveLength(1)
  })

  it('keeps the ContextRow job sentence on an unmigrated route (there it is the only job sentence)', () => {
    // An unmigrated route with no PageFamilyFrame region-3 sentence (e.g. an admin sub-route that
    // falls back to the Home job key) — ContextRow stays the sole owner and must NOT be globally
    // suppressed. (`/work/signals` was moved to a migrated route in the Luna single-job-sentence
    // correction; region 3 owns it there now.)
    renderCtx('/admin/roles')
    expect(screen.getByText('What needs my attention right now?')).toBeInTheDocument()
  })

  it('owner-eyes item 8: suppresses the orphan scope crumb on a migrated route (region stays, but empty + collapsed)', () => {
    // The region landmark must remain (the shell anatomy contract), but on a migrated route whose
    // head already carries context the strip renders NOTHING — no lone "Café" crumb above the title.
    renderCtx('/work/tasks')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region).toHaveAttribute('data-anatomy', 'context-row')
    expect(region.textContent).not.toContain('Café')
    expect(region.textContent?.trim()).toBe('')
    expect(region).toHaveStyle({ height: '0px' })
  })
})
