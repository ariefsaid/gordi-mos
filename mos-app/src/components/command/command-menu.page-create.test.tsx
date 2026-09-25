import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn() }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ searchPeopleByName: vi.fn() }))
vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/work-authority', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/work-authority')>()),
  getWorkWriteScopes: vi.fn(),
}))

import { useAuth } from '@/auth/use-auth'
import { emptyWorkWriteScopes, getWorkWriteScopes } from '@/lib/db/work-authority'
import { CommandMenu } from './command-menu'

const mockScopes = vi.mocked(getWorkWriteScopes)

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<CommandMenu open mode="launcher" onClose={vi.fn()} onShareSignal={vi.fn()} />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

// Below the rail-collapse width this menu entry is the only create door for these two collections
// (their header button yields to it), so its presence, gating and position are owned here.
describe('page create action in the actions list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      status: 'authenticated',
      viewer: {
        person: { id: 'p1', org_id: 'o1', user_id: 'u1', full_name: 'U', email: null, archived_at: null, created_at: '', updated_at: '', must_change_password: false },
        roles: [], isManager: false, accessRoles: ['admin'], affiliated: [],
      },
      signOut: vi.fn(),
    })
  })

  it.each([
    ['/work/objectives', 'Create objective', { objective_org: true }],
    ['/work/projects', 'Create project or process', { workline_org: true }],
  ])('leads the actions on %s for a viewer who may create there', async (path, label, grant) => {
    mockScopes.mockResolvedValue({ ...emptyWorkWriteScopes(), ...grant })
    renderAt(path)
    const row = await screen.findByRole('option', { name: label })
    const options = screen.getAllByRole('option')
    expect(options[0]).toBe(row)
  })

  it('is absent without create scope', async () => {
    mockScopes.mockResolvedValue(emptyWorkWriteScopes())
    renderAt('/work/objectives')
    await waitFor(() => expect(mockScopes).toHaveBeenCalled())
    expect(screen.queryByRole('option', { name: 'Create objective' })).toBeNull()
  })

  it('is absent on a record page and on other collections', async () => {
    mockScopes.mockResolvedValue({ ...emptyWorkWriteScopes(), objective_org: true, workline_org: true })
    const first = renderAt('/work/objectives/abc')
    await waitFor(() => expect(mockScopes).toHaveBeenCalled())
    expect(screen.queryByRole('option', { name: 'Create objective' })).toBeNull()
    first.unmount()
    renderAt('/work/tasks')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Create task' })).toBeInTheDocument())
    expect(screen.queryByRole('option', { name: 'Create objective' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Create project or process' })).toBeNull()
  })
})
