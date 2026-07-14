import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ContextRow } from './context-row'

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
      roles: [{ id: 'r1', name: 'Barista', org_id: 'o1', person_id: 'p1', access_role: 'member', archived_at: null, created_at: '', updated_at: '' }],
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

  it('AC-013: shows the Tasks job sentence at /work/tasks', () => {
    renderCtx('/work/tasks')
    expect(screen.getByText('Find and do the work I own or my Team owns.')).toBeInTheDocument()
  })

  it('AC-013: shows the Tasks job sentence at a record route /work/tasks/:id', () => {
    renderCtx('/work/tasks/abc')
    expect(screen.getByText('Find and do the work I own or my Team owns.')).toBeInTheDocument()
  })

  it('AC-013: shows the Money job sentence at /money', () => {
    renderCtx('/money')
    expect(screen.getByText('Trust the financial figures and act on money exceptions.')).toBeInTheDocument()
  })

  it('AC-013: shows the viewer scope (name) in the context row', () => {
    renderCtx('/')
    const region = screen.getByRole('region', { name: 'Context' })
    expect(region.textContent).toContain('Cahya')
  })
})
