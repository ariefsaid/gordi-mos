// The shell's overlay wiring (#190) — the seam every record surface will plug into.
//
// Kept out of app-shell.test.tsx so the module mocks these cases need (auth, notifications) do not
// perturb #219's chrome layout suite, which is the pattern top-bar-assistant.test.tsx already sets.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({
  getBusinessUnits: vi.fn().mockResolvedValue([]),
  getPeople: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/notifications', () => ({
  countUnread: vi.fn().mockResolvedValue(0),
  listNotifications: vi.fn().mockResolvedValue([]),
}))
vi.mock('../auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

import { AppShell } from './app-shell'
import { useOverlayHost, useOptionalOverlayHost, type OverlayHostApi } from './overlay-host'

function Page({ onReady }: { onReady?: (api: OverlayHostApi) => void }) {
  const api = useOverlayHost()
  onReady?.(api)
  return <div role="main">page</div>
}

/** Renders inside the shell but reports whether an ambient host exists at all. */
function OptionalProbe({ onReady }: { onReady: (api: OverlayHostApi | null) => void }) {
  onReady(useOptionalOverlayHost())
  return <div role="main">page</div>
}

function renderShell(page: React.ReactNode) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: '40000000-0000-0000-0000-000000000001',
        org_id: '10000000-0000-0000-0000-000000000001',
        user_id: 'auth-user-001',
        full_name: 'Cahya Cafe',
        email: 'cahya@example.test',
        archived_at: null,
        must_change_password: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles: [],
    },
    signOut: vi.fn(),
  })
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={page} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('AppShell — the overlay host is ambient', () => {
  it('a page rendered through the Outlet can reach the controller without providing its own', () => {
    // The point of mounting the provider at the shell rather than per page: any surface under the
    // Outlet inherits ONE controller, which is what makes the no-double-panel invariant possible.
    let api: OverlayHostApi | null = null
    renderShell(<OptionalProbe onReady={(value) => { api = value }} />)
    expect(api).not.toBeNull()
  })

  it('the shell owns exactly one owner="shell" slot, as a direct child of the shell grid', async () => {
    let api!: OverlayHostApi
    const { container } = renderShell(<Page onReady={(value) => { api = value }} />)

    const slots = container.querySelectorAll('[data-overlay-host-slot]')
    expect(slots).toHaveLength(1)
    expect(slots[0].getAttribute('data-overlay-host-slot')).toBe('shell')
    const shellGrid = container.querySelector('[style*="display: grid"]') as HTMLElement
    expect(shellGrid.querySelector(':scope > [data-overlay-host-slot="shell"]')).not.toBeNull()

    // …and it is a live slot, not decoration: a shell-owned entry mounts one physical panel in it.
    await act(() => api.openRoot({
      key: 'quick:1', owner: 'shell', tenant: 'quick', label: 'Quick surface',
      title: 'Quick surface', content: <button type="button">quick control</button>,
    }, 'ephemeral'))
    await waitFor(() => expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'quick control' })).toBeInTheDocument()
  })

  it('an entry owned by a collection does NOT mount in the shell slot', async () => {
    // The owner filter is what stops the shell slot from rendering a record that belongs beside a
    // collection. Without it every record would float over the page instead of squashing it.
    let api!: OverlayHostApi
    renderShell(<Page onReady={(value) => { api = value }} />)
    await act(() => api.openRoot({
      key: 'signal:1', owner: 'signals', tenant: 'record', label: 'Signal record',
      title: 'Signal record', content: <button type="button">signal control</button>,
    }, 'route'))
    expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'signal control' })).toBeNull()
    // The session is live — it is the SLOT that declined, not the controller.
    expect(api.session?.frames.at(-1)?.entry.owner).toBe('signals')
  })

  it('the shell panel is dismissible by keyboard and returns focus to whatever opened it', async () => {
    let api!: OverlayHostApi
    renderShell(<Page onReady={(value) => { api = value }} />)
    const opener = screen.getByRole('button', { name: /search/i })
    opener.focus()

    await act(() => api.openRoot({
      key: 'quick:1', owner: 'shell', tenant: 'quick', label: 'Quick surface',
      title: 'Quick surface', content: <button type="button">quick control</button>,
    }, 'ephemeral'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'quick control' }))

    await act(() => api.close('escape'))
    await waitFor(() => expect(document.querySelectorAll('[data-overlay-host="true"]')).toHaveLength(0))
    expect(document.activeElement).toBe(opener)
  })
})
