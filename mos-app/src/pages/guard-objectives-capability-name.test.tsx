// GUARD — ObjectivesPage must gate writes on effective Objective authority independently from
// neighbouring Work authority. This file keeps the runtime scope distinction explicit: an
// objective grant must not be borrowed from, or blocked by, a work-line grant.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/objectives', () => ({
  listObjectivesAll: vi.fn(),
  createObjective: vi.fn(),
  renameObjective: vi.fn(),
  setObjectiveArchived: vi.fn(),
}))
vi.mock('@/lib/db/work-lines', () => ({ listWorkLinesAll: vi.fn() }))
vi.mock('@/lib/db/tasks', () => ({ listTasks: vi.fn() }))
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({ workline_org: false, objective_org: false, workline_bu_ids: [], objective_bu_ids: [] }),
  getWorkWriteScopes: vi.fn(),
}))

import { listObjectivesAll } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { useAuth } from '@/auth/use-auth'
import type { AuthState } from '@/auth/context'
import { getWorkWriteScopes } from '@/lib/db/work-authority'
import { ObjectivesPage } from './objectives-page'

const mockGetWorkWriteScopes = vi.mocked(getWorkWriteScopes)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetWorkWriteScopes.mockResolvedValue({
    workline_org: false,
    objective_org: true,
    workline_bu_ids: [],
    objective_bu_ids: [],
  })
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Test Viewer',
        email: 'viewer@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles: ['ops_lead'], affiliated: [],
    },
    signOut: vi.fn(),
  } as AuthState)
  vi.mocked(listObjectivesAll).mockResolvedValue([
    { id: 'obj-1', name: 'Grow revenue', archived_at: null },
  ])
  vi.mocked(listWorkLinesAll).mockResolvedValue([])
  vi.mocked(listTasks).mockResolvedValue([])
})

async function renderObjectives() {
  render(
    <I18nProvider>
      <MemoryRouter>
        <ObjectivesPage />
      </MemoryRouter>
    </I18nProvider>,
  )
  await screen.findByText('Grow revenue')
}

const writeAffordances = () => [
  screen.queryByRole('button', { name: 'Create objective' }),
]

describe('GUARD-OBJECTIVE-CAP: Objectives gates writes on effective objective authority, not a neighbour', () => {
  it('grants Objective writes when effective objective authority is present without Work authority', async () => {
    mockGetWorkWriteScopes.mockResolvedValue({
      workline_org: false,
      objective_org: true,
      workline_bu_ids: [],
      objective_bu_ids: [],
    })
    await renderObjectives()
    for (const affordance of writeAffordances()) expect(affordance).toBeInTheDocument()
  })

  it('withholds Objective writes when effective objective authority is absent despite Work authority', async () => {
    mockGetWorkWriteScopes.mockResolvedValue({
      workline_org: true,
      objective_org: false,
      workline_bu_ids: [],
      objective_bu_ids: [],
    })
    await renderObjectives()
    for (const affordance of writeAffordances()) expect(affordance).toBeNull()
    // …and reading is untouched: the row remains a canonical record link.
    expect(screen.getByRole('link', { name: 'Grow revenue' })).toHaveAttribute('href', '/work/objectives/obj-1')
  })
})
