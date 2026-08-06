// #243 — the Inbox record panel offers exactly ONE close affordance for a task-typed notification.
//
// The panel chrome (RecordPanelHost) owns dismissal: it is the control that exists for every record
// kind, at every width, and it is the one wired to the overlay host's leave-guarded close. The
// embedded record body must therefore render no close of its own — `TaskSurface` already carries
// `showPanelUtility={false}` for exactly this (the same switch TaskDrawer and tasks-layout pass).
//
// This is the real journey, not a prop assertion: build the door's entry the way the Inbox does
// (buildInboxTargetDeps → resolveNotificationTarget), mount the resolved content inside the real
// shared host, and count what a triager can actually click.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import type { PeopleRow } from '@/lib/database.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { NotificationRow } from '@/lib/db/notifications'

vi.mock('../../lib/db/tasks', () => ({
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskFields: vi.fn(),
  addChecklistItem: vi.fn(),
  toggleChecklistItem: vi.fn(),
  reorderChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  archiveTask: vi.fn(),
  unarchiveTask: vi.fn(),
}))
vi.mock('../../lib/db/directory', () => ({
  getBusinessUnits: vi.fn(),
  getPeople: vi.fn(),
}))

import { getTask } from '@/lib/db/tasks'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { buildInboxTargetDeps } from './inbox-record-door'
import { resolveNotificationTarget } from './inbox-target'

const VIEWER_ID = 'viewer-person-id'

const mockPerson: PeopleRow = {
  id: VIEWER_ID, org_id: 'org', user_id: 'uid', full_name: 'Cahya Cafe',
  email: 'cahya@example.test', must_change_password: false, archived_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const authedState: AuthState = {
  status: 'authenticated',
  viewer: { person: mockPerson, roles: [], isManager: false, accessRoles: ['member'] },
  signOut: async () => {},
}

function makeTask(): TaskListRow {
  return {
    id: 'task-abc', org_id: 'org', title: 'Fix the coffee machine',
    business_unit_id: 'bu-1', status: 'Open',
    responsible_person_id: VIEWER_ID, accountable_person_id: VIEWER_ID,
    consulted_person_ids: [], informed_person_ids: [],
    description: 'desc', due_date: '2026-06-20', objective_id: null, work_line_id: null,
    last_activity_at: '2026-06-11T08:00:00Z',
    archived_at: null, created_by: VIEWER_ID,
    created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z',
  }
}

function taskNotification(): NotificationRow {
  return {
    id: 'n1',
    severity: 'info',
    title: 'Café opening overdue',
    body: null,
    metadata: { entity: { type: 'task', id: 'task-abc', route: '/work/tasks/task-abc' } },
    read_at: null,
    created_at: '2026-07-21T00:00:00Z',
  }
}

// ≥1100px non-modal split — the regime a desktop triager opens the Inbox panel in.
function stubSplitWidth() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('1100') || query.includes('768'),
      media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  stubSplitWidth()
  vi.mocked(getTask).mockResolvedValue({ task: makeTask(), checklist: [], events: [] })
  vi.mocked(getBusinessUnits).mockResolvedValue([{ id: 'bu-1', name: 'Cafe Operations' }])
  vi.mocked(getPeople).mockResolvedValue([{ id: VIEWER_ID, full_name: 'Cahya Cafe' }])
})

function renderTaskPanel(onClose = vi.fn()) {
  const row = taskNotification()
  const resolved = resolveNotificationTarget(row, buildInboxTargetDeps(row, ['member'], 'inbox'))
  if (resolved.status !== 'available') throw new Error(`door refused the task target: ${resolved.status}`)
  const utils = render(
    <AuthContext.Provider value={authedState}>
      <MemoryRouter>
        <I18nProvider>
          <RecordPanelHost label="Task" title="Task" onClose={onClose}>
            {resolved.entry.content}
          </RecordPanelHost>
        </I18nProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { ...utils, onClose }
}

describe('Issue 243 — the Inbox task record panel has ONE close button', () => {
  it('renders exactly one close control once the record has loaded, and it belongs to the panel chrome', async () => {
    renderTaskPanel()
    await screen.findByText('Fix the coffee machine')

    const closes = screen.getAllByRole('button', { name: /^close/i })
    expect(closes).toHaveLength(1)
    expect(closes[0].closest('.record-panel-chrome')).not.toBeNull()
    // The record body renders chrome-free: no TaskSurface utility bar inside the host.
    expect(document.querySelector('.dw-bar')).toBeNull()
  })

  it('the one close actually dismisses the panel (the host owns the leave-guarded close)', async () => {
    const { onClose } = renderTaskPanel()
    await screen.findByText('Fix the coffee machine')

    fireEvent.click(screen.getByRole('button', { name: /^close/i }))
    expect(onClose).toHaveBeenCalledWith('explicit-close')
  })
})
