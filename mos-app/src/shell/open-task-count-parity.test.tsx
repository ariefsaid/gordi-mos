import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/theme/theme-provider'
import { Rail } from './rail'
import { useMyOpenTaskCount } from '@/hooks/useMyOpenTaskCount'
import { updateTaskStatus } from '@/lib/db/tasks'
import { __resetOpenTaskCountForTests } from '@/lib/open-task-count-store'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/open-task-count', () => ({ getMyOpenTaskCount: vi.fn() }))
// A task write that succeeds: update(...).eq(...) and insert(...) both resolve { error: null }.
vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {}
  builder.update = () => builder
  builder.eq = () => Promise.resolve({ error: null })
  builder.insert = () => Promise.resolve({ error: null })
  return { supabase: { schema: () => ({ from: () => builder }) } }
})

import { useAuth } from '@/auth/use-auth'
import { getMyOpenTaskCount } from '@/lib/db/open-task-count'

const mockUseAuth = vi.mocked(useAuth)
const mockCount = vi.mocked(getMyOpenTaskCount)

// Stands in for Home's "N open" figure, which reads the same hook.
function HomeOpen() {
  const count = useMyOpenTaskCount()
  return <p data-testid="home-open">{count ?? '—'}</p>
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetOpenTaskCountForTests()
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: { person: { id: 'viewer', full_name: 'Test Viewer', email: 'viewer@example.test' }, roles: [], isManager: false, accessRoles: ['admin'], affiliated: [] },
    signOut: vi.fn(),
  } as never)
})

describe('rail badge and Home share one open-task count across task changes (#1129)', () => {
  it('after a task write, both show the refreshed number', async () => {
    mockCount.mockResolvedValue(3)
    render(
      <ThemeProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/work/tasks']}>
            <Rail />
            <HomeOpen />
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>,
    )
    const badge = () => within(screen.getByRole('link', { name: /^Tasks/ })).queryByText(/^\d+$/)?.textContent
    await waitFor(() => expect(badge()).toBe('3'))
    await waitFor(() => expect(screen.getByTestId('home-open')).toHaveTextContent('3'))

    mockCount.mockResolvedValue(4)
    await updateTaskStatus('t1', 'Open', 'In Progress', 'viewer')

    await waitFor(() => expect(badge()).toBe('4'))
    await waitFor(() => expect(screen.getByTestId('home-open')).toHaveTextContent('4'))
  })
})
