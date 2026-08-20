// GUARD — ObjectivesPage must gate its writes on `objective.manage`, by NAME.
//
// Why this file exists, and why it is not part of objectives-page.test.tsx.
//
// PORT-028's journey test proves the right BEHAVIOUR: a viewer holding `member` sees no write
// affordance, a viewer holding `ops_lead` sees them all. That test cannot, however, tell
// `objective.manage` from `workline.manage` — found by mutation during the #194 port, where
// swapping the capability string left the whole suite green. The reason is in the seed
// (src/lib/capabilities.ts): `admin` and `ops_lead` hold BOTH capabilities and `finance` and
// `member` hold NEITHER, so under today's grants the two strings are behaviourally identical and
// no persona can separate them.
//
// That equivalence is temporary and the file it lives in says so — capabilities.ts carries
// TODO(admin-editable-roles, ADR-0020 D2): the static map becomes an RPC once grants are editable.
// On the day an owner grants a role `workline.manage` without `objective.manage`, a page gating on
// the wrong string starts hiding Objectives' writes from people entitled to them, or showing them
// to people who are not — and the persona test stays green through all of it.
//
// So this guard pins the string itself. It mocks the capability module, which is why it needs its
// own file: the journey tests must keep exercising the REAL `can()` derivation, and vi.mock is
// hoisted per module registry, not per describe block.
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
vi.mock('@/lib/capabilities', () => ({ can: vi.fn() }))

import { listObjectivesAll } from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'
import { useAuth } from '@/auth/use-auth'
import type { AuthState } from '@/auth/context'
import { can } from '@/lib/capabilities'
import { ObjectivesPage } from './objectives-page'

const ACCESS_ROLES = ['ops_lead']

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(can).mockReturnValue(true)
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Test Viewer',
        email: 'viewer@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles: ACCESS_ROLES,
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
  screen.queryByRole('button', { name: 'Rename Grow revenue' }),
  screen.queryByRole('button', { name: 'Archive Grow revenue' }),
]

describe('GUARD-OBJECTIVE-CAP: Objectives gates writes on objective.manage, not a neighbour', () => {
  it('asks for the objective.manage capability, using the viewer’s own access roles', async () => {
    await renderObjectives()
    expect(can).toHaveBeenCalledWith(ACCESS_ROLES, 'objective.manage')
  })

  // The original form of this guard asserted `can` was NEVER asked about `workline.manage` on this
  // page. That over-reached its own stated goal the moment the relations drill grew a legitimate
  // `workline.manage` read — the branch name is a door into the route-gated Projects & Processes
  // catalog (#204 review, finding 1), which has nothing to do with who may WRITE an Objective. So
  // the guard now pins the thing it actually means, and pins it harder: the write affordances
  // follow `objective.manage` and follow NOTHING else. Swapping the page's string for its
  // neighbour's fails both cases below, which is what the mutation during #194 got away with.
  it('withholds every write affordance when objective.manage alone is missing', async () => {
    vi.mocked(can).mockImplementation((_roles, capability) => capability !== 'objective.manage')
    await renderObjectives()
    for (const affordance of writeAffordances()) expect(affordance).toBeNull()
    // …and reading is untouched: the row, its relations disclosure and its trace all still render.
    expect(screen.getByRole('button', { name: 'Show relations for Grow revenue' })).toBeInTheDocument()
  })

  it('grants every write affordance when objective.manage alone is held', async () => {
    vi.mocked(can).mockImplementation((_roles, capability) => capability === 'objective.manage')
    await renderObjectives()
    for (const affordance of writeAffordances()) expect(affordance).toBeInTheDocument()
  })
})
