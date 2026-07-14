// T28 — the top-bar deputy launcher (next to search), a neutral header icon on EVERY viewport
// (desktop + phone; DESIGN.md No-FAB Rule, owner-agreed 2026-07-07 — no floating orange FAB).
// Gates on SHOW_ASSISTANT only; aria-label = t('assistant.open'); calls openPanel().
// AC-AP-001 (opens the slide-over), AC-AP-005/AC-CF-003 (absent when the flag is off).
//
// Isolated in its own file so the SHOW_ASSISTANT mock does not perturb the existing top-bar tests
// (which assert the flag-off default: no assistant button).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'

// Mutable flag via a getter so each test toggles SHOW_ASSISTANT without a module reset.
const flag = { SHOW_ASSISTANT: true }
vi.mock('@/config/features', () => ({
  get SHOW_ASSISTANT() {
    return flag.SHOW_ASSISTANT
  },
  SHOW_USER_VIEWS: false,
  SHOW_WEEKLY_UPDATES: false,
  SHOW_FOLLOWUPS: false,
  SHOW_PLAN_BUDGET: false,
  SHOW_DAILY_LOG: false,
}))

vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('./use-is-narrow')
import { useIsNarrow } from './use-is-narrow'
const mockUseIsNarrow = vi.mocked(useIsNarrow)

import { TopBar } from './top-bar'

const viewer = {
  person: {
    id: '40000000-0000-0000-0000-000000000001',
    org_id: '10000000-0000-0000-0000-000000000001',
    user_id: 'auth-user-001',
    full_name: 'Cahya Cafe',
    email: 'cahya@gordi.id',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  roles: [],
  isManager: false,
  accessRoles: [],
}

function renderTopBar({ narrow, withPanel }: { narrow: boolean; withPanel?: boolean }) {
  mockUseIsNarrow.mockReturnValue(narrow)
  mockUseAuth.mockReturnValue({ status: 'authenticated', viewer, signOut: vi.fn() })
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/tasks']}>
        <AgentRuntimeProvider runtime={null}>
          <Routes>
            <Route path="*" element={<TopBar onOpenDrawer={vi.fn()} />} />
          </Routes>
          {withPanel ? <AssistantPanel /> : null}
        </AgentRuntimeProvider>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('TopBar assistant button (T28)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flag.SHOW_ASSISTANT = true
  })

  it('AC-AP-001: renders next to the search affordance on desktop (flag on)', () => {
    renderTopBar({ narrow: false })
    const btn = screen.getByRole('button', { name: 'Open deputy' })
    expect(btn).toBeInTheDocument()
    // It sits in the right cluster after search, before the bell — assert it precedes the bell.
    const search = screen.getByRole('button', { name: /Search/i })
    const bell = screen.getByRole('button', { name: 'Notifications' })
    const precedes = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(precedes(search, btn)).toBe(true)
    expect(precedes(btn, bell)).toBe(true)
  })

  it('AC-AP-001: clicking the desktop button opens the slide-over', () => {
    renderTopBar({ narrow: false, withPanel: true })
    expect(screen.queryByRole('complementary', { name: 'Deputy' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open deputy' }))
    expect(screen.getByRole('complementary', { name: 'Deputy' })).toBeInTheDocument()
  })

  it('AC-AP-001: renders on a narrow viewport too (deputy launcher is in the header on every viewport, no FAB)', () => {
    renderTopBar({ narrow: true })
    const btn = screen.getByRole('button', { name: 'Open deputy' })
    expect(btn).toBeInTheDocument()
    expect(btn.className).toMatch(/tap-target-phone--icon/)
  })

  it('AC-AP-005/AC-CF-003: does not render when SHOW_ASSISTANT=false', () => {
    flag.SHOW_ASSISTANT = false
    renderTopBar({ narrow: false })
    expect(screen.queryByRole('button', { name: 'Open deputy' })).toBeNull()
  })
})
