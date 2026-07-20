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

  it('AC-013: shows the Home job sentence at /', () => {
    renderCtx('/')
    expect(screen.getByText('What needs my attention right now?')).toBeInTheDocument()
  })

  it('AC-013: shows the Signals job sentence at /work/signals', () => {
    renderCtx('/work/signals')
    expect(screen.getByText('Search and revisit the Signals your Teams have shared.')).toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the Tasks job sentence at the migrated /work/tasks route (region 3 owns it)', () => {
    renderCtx('/work/tasks')
    expect(screen.queryByText('Find and do the work I own or my Team owns.')).not.toBeInTheDocument()
  })

  it('R-OWNER-1: suppresses the job sentence at the migrated record route /work/tasks/:id', () => {
    renderCtx('/work/tasks/abc')
    expect(screen.queryByText('Find and do the work I own or my Team owns.')).not.toBeInTheDocument()
  })

  it('AC-013: shows the Money job sentence at /money', () => {
    renderCtx('/money')
    expect(screen.getByText('Trust the financial figures and act on money exceptions.')).toBeInTheDocument()
  })

  it('AC-013: shows the viewer scope signal, not the viewer name, in the context row', () => {
    renderCtx('/')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Café')
    expect(region.textContent).not.toContain('Cahya')
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
    renderCtx('/money')
    expect(screen.getByText('Trust the financial figures and act on money exceptions.')).toBeInTheDocument()
  })

  it('still renders the Context region (with scope) on a migrated route', () => {
    renderCtx('/work/tasks')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region).toHaveAttribute('data-anatomy', 'context-row')
    expect(region.textContent).toContain('Café')
  })
})
