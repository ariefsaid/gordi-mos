// #301 — the Home arrangement preference must be resolved BEFORE the first paint (FR-921/924,
// OD-V4-9). The old wiring initialized useState('focused') and applied the stored preference in a
// post-mount effect, so every viewer with a stored non-default arrangement got one wrong Focused
// frame on load. This file pins the lazy-initializer fix at the only observable seam a unit test
// has: WHICH arrangement component ever mounts. The three arrangements are stubbed as recorders —
// which is exactly why these cases live in their own file and not home-page.test.tsx, whose suites
// need the real arrangements' DOM (tablist, landmarks, bento grid).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

// ── The three arrangements, stubbed as mount recorders ───────────────────────────────────────
vi.mock('../components/home/home-focused', () => ({
  HomeFocused: vi.fn(() => <div data-testid="arr-focused" />),
}))
vi.mock('../components/home/home-overview', () => ({
  HomeOverview: vi.fn(() => <div data-testid="arr-overview" />),
}))
vi.mock('../components/home/home-list', () => ({
  HomeList: vi.fn(() => <div data-testid="arr-list" />),
}))
import { HomeFocused } from '@/components/home/home-focused'
import { HomeList } from '@/components/home/home-list'
const mockFocused = vi.mocked(HomeFocused)
const mockList = vi.mocked(HomeList)

// ── The data layer Home fetches on mount (same mock set as home-page.test.tsx) ───────────────
vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('../lib/db/tasks', () => ({ listTasks: vi.fn() }))
import { listTasks } from '@/lib/db/tasks'

vi.mock('../lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))
import { getBusinessUnits, getPeople } from '@/lib/db/directory'

vi.mock('../lib/db/notifications', () => ({
  listNotifications: vi.fn(),
  notificationRoute: () => null,
}))
import { listNotifications } from '@/lib/db/notifications'

vi.mock('../lib/db/home-attention-data', () => ({
  loadFailedChecksForViewer: vi.fn(),
  CAFE_LOG_ROUTE: '/cafe/log',
}))
import { loadFailedChecksForViewer } from '@/lib/db/home-attention-data'

// Partial mock, mirroring home-page.test.tsx: only the two reads are controlled; the module's
// other exports (feed ordering) stay real for whichever module imports them at load.
vi.mock('../lib/db/signals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/signals')>()),
  listReadableSignals: vi.fn(),
  listAllTeams: vi.fn(),
}))
import { listReadableSignals, listAllTeams } from '@/lib/db/signals'

vi.mock('../shell/signal-composer-host', () => ({
  useSignalComposer: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, postCount: 0 }),
}))

import { HomePage } from './home-page'

const PERSON_ID = '40000000-0000-0000-0000-000000000001'
const viewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: PERSON_ID,
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-user-001',
      full_name: 'Cahya Cafe',
      email: 'cahya.dev@example.test',
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
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

async function renderHome() {
  mockUseAuth.mockReturnValue(viewer)
  await act(async () => {
    render(createElement(HomePage), { wrapper })
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  vi.mocked(listTasks).mockResolvedValue([])
  vi.mocked(getBusinessUnits).mockResolvedValue([])
  vi.mocked(getPeople).mockResolvedValue([])
  vi.mocked(listNotifications).mockResolvedValue([])
  vi.mocked(loadFailedChecksForViewer).mockResolvedValue([])
  vi.mocked(listReadableSignals).mockResolvedValue([])
  vi.mocked(listAllTeams).mockResolvedValue([])
})

// ("issue 301" not "#301" in the title: the design-token lint bans #-hex-shaped string literals.)
describe('issue 301: the stored Home arrangement paints on the FIRST frame — no Focused flash', () => {
  it('with a stored "list" preference, List renders and Focused NEVER mounts', async () => {
    window.localStorage.setItem(`gordi.home.layout.${PERSON_ID}`, 'list')
    await renderHome()
    expect(screen.getByTestId('arr-list')).toBeInTheDocument()
    // The teeth: under the old effect-applied wiring the first render committed HomeFocused and
    // only a post-mount effect swapped it for List — so this call count was ≥ 1 and this fails.
    expect(mockFocused).not.toHaveBeenCalled()
  })

  it('with nothing stored, the Focused default still renders (the lazy init changed timing, not the default)', async () => {
    await renderHome()
    expect(screen.getByTestId('arr-focused')).toBeInTheDocument()
    expect(mockList).not.toHaveBeenCalled()
  })
})
