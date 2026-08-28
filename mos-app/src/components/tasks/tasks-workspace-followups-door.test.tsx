// Money-inbox-alignment (Step 9) — Door 1: the Tasks saved-view `?view=followups`
// chip renders the LIVE Follow-up queue once SHOW_FOLLOWUPS is on (AC-904),
// reusing the useFollowUpQueue + FollowUpQueueTable pair. FollowUpsPage does NOT use that pair —
// it is a 261-line bespoke renderer importing none of the three, so "the same as the canonical
// page" was the fifth copy of the claim #428 was filed to correct. Both doors are dark behind
// SHOW_FOLLOWUPS, so the divergence is in the source, not in anything a viewer reaches
// (AC-907/AC-908). Flag-variant file — tasks-workspace.test.tsx keeps proving the
// flag-off placeholder path (AC-311) unmocked/unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { PeopleRow, RolesRow } from '@/lib/database.types'
import type { FollowUpRow } from '@/lib/db/follow-ups'

vi.mock('@/config/features', async () => {
  const actual = await vi.importActual<typeof import('@/config/features')>('@/config/features')
  return { ...actual, SHOW_FOLLOWUPS: true }
})
vi.mock('../../lib/db/tasks', () => ({
  listTasks: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../lib/db/objectives', () => ({ listObjectives: vi.fn().mockResolvedValue([]) }))
vi.mock('../../lib/db/work-lines', () => ({ listWorkLines: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUps: vi.fn(), transitionFollowUp: vi.fn() }
})

import { listFollowUps } from '@/lib/db/follow-ups'
import { TasksWorkspace } from './tasks-workspace'
import { OverlayHostProvider } from '@/shell/overlay-host'

const mockListFollowUps = vi.mocked(listFollowUps)

const VIEWER_PERSON: PeopleRow = {
  id: 'viewer-id', org_id: 'org', user_id: 'uid', full_name: 'Sales Lead',
  email: 'sales@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const mockRole: RolesRow = {
  id: 'role-1', org_id: 'org', business_unit_id: 'bu-sales', name: 'Sales Lead',
  reports_to_role_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: VIEWER_PERSON, roles: [mockRole], isManager: false, accessRoles: [] },
  signOut: async () => {},
}

const FOLLOWUPS_SAVED_VIEW: React.ComponentProps<typeof TasksWorkspace>['savedView'] = {
  view: 'followups', activeChip: 'followups', segment: 'all', overdueOnly: false,
  reserved: 'followups', search: '?view=followups',
}

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1000000, running_balance: 1000000, state: 'open',
  promise_date: null, issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: null, notes: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

function renderFollowupsView() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={authedState}>
        <MemoryRouter initialEntries={['/work/tasks?view=followups']}>
          <OverlayHostProvider>
            <TasksWorkspace savedView={FOLLOWUPS_SAVED_VIEW} onSavedViewChange={() => {}} />
          </OverlayHostProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('768') || query.includes('1100'),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
  mockListFollowUps.mockResolvedValue([row])
})

describe('TasksWorkspace — Follow-ups saved view, live door (Step 9)', () => {
  it('AC-904: renders the real Follow-up queue instead of the reserved placeholder once SHOW_FOLLOWUPS is on', async () => {
    renderFollowupsView()
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.queryByText(/follow-ups are coming to this workspace/i)).not.toBeInTheDocument()
  })
})
