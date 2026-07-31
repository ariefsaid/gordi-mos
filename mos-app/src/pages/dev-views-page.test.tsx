// DevViewsPage tests (AC-UV-018 — the zero-agent loop: compose → save → reopen → render).
// Mocks the DAL + the renderer (isolates the harness's own wiring from the renderer's own
// async compile/execute loop, which renderer.test.tsx already covers).
import { createElement, type ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
const mockUseAuth = vi.mocked(useAuth)

vi.mock('@/lib/db/user-views', () => ({
  listUserViews: vi.fn(),
  getUserView: vi.fn(),
  createUserView: vi.fn(),
}))
import { listUserViews, getUserView, createUserView } from '@/lib/db/user-views'
import type { UserViewRow } from '@/lib/db/user-views'

vi.mock('@/lib/viewspec/renderer', () => ({
  UserViewRenderer: ({ spec }: { spec: unknown }) => (
    <div data-testid="uv-renderer-mock">{JSON.stringify(spec)}</div>
  ),
  buildCompilerContext: (personId: string, orgId: string) => ({ personId, orgId }),
}))

import { DevViewsPage } from './dev-views-page'

const mockListUserViews = vi.mocked(listUserViews)
const mockGetUserView = vi.mocked(getUserView)
const mockCreateUserView = vi.mocked(createUserView)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, null, createElement(MemoryRouter, null, children))
}

const authedState: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'person-1', org_id: 'org-1', user_id: 'u1', full_name: 'A', email: null, must_change_password: false, archived_at: null, created_at: '', updated_at: '' },
    roles: [],
    isManager: false,
    accessRoles: [],
  },
  signOut: vi.fn(),
}

const SAVED_ROW: UserViewRow = {
  id: 'v1', name: 'My view',
  spec: { version: 1, panels: [{ id: 'p1', primitive: 'DataTable', querySpec: { entity: 'objectives', select: ['id', 'name'] } }] },
  scope: 'private', created_at: 'a', updated_at: 'b', archived_at: null,
}

beforeEach(() => {
  mockUseAuth.mockReturnValue(authedState)
  mockListUserViews.mockReset().mockResolvedValue([])
  mockGetUserView.mockReset().mockResolvedValue(null)
  mockCreateUserView.mockReset().mockResolvedValue(SAVED_ROW)
})

describe('DevViewsPage — AC-UV-018', () => {
  it('renders the title + the seeded sample spec in the textarea', async () => {
    render(<DevViewsPage />, { wrapper })
    expect(await screen.findByText('User Views')).toBeInTheDocument()
    const textarea = screen.getByLabelText('Composition spec (JSON)') as HTMLTextAreaElement
    expect(textarea.value).toContain('"version": 1')
    expect(textarea.value).toContain('DataTable')
  })

  it('shows the empty-state message when there are no saved views', async () => {
    render(<DevViewsPage />, { wrapper })
    expect(await screen.findByText('No saved views yet')).toBeInTheDocument()
  })

  it('Save calls createUserView with the parsed spec + name + private scope, shows Saved, and refreshes the list', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<DevViewsPage />, { wrapper })

    await screen.findByText('User Views')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockCreateUserView).toHaveBeenCalledTimes(1))
    const arg = mockCreateUserView.mock.calls[0][0]
    expect(arg.scope).toBe('private')
    expect(arg.spec.version).toBe(1)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    // refresh() re-lists after save
    expect(mockListUserViews).toHaveBeenCalledTimes(2)
  })

  it('invalid JSON + Render shows the invalid-JSON status and never invokes the renderer with it', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<DevViewsPage />, { wrapper })

    const textarea = await screen.findByLabelText('Composition spec (JSON)')
    fireEvent.change(textarea, { target: { value: '{ not valid json' } })
    await user.click(screen.getByRole('button', { name: 'Render' }))

    expect(await screen.findByText('Invalid JSON — fix and try again')).toBeInTheDocument()
  })

  it('valid JSON + Render invokes UserViewRenderer with the parsed spec', async () => {
    render(<DevViewsPage />, { wrapper })
    await screen.findByText('User Views')
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Render' }))

    const mock = await screen.findByTestId('uv-renderer-mock')
    expect(mock.textContent).toContain('DataTable')
  })

  it('a viewId prop loads the saved view into the editor via getUserView', async () => {
    mockGetUserView.mockResolvedValue(SAVED_ROW)
    render(<DevViewsPage viewId="v1" />, { wrapper })

    await waitFor(() => expect(mockGetUserView).toHaveBeenCalledWith('v1'))
    const nameInput = await screen.findByLabelText('View name') as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('My view'))
  })

  it('invalid JSON + Save shows the invalid-JSON status and never calls createUserView', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<DevViewsPage />, { wrapper })

    const textarea = await screen.findByLabelText('Composition spec (JSON)')
    fireEvent.change(textarea, { target: { value: '{ not valid json' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Invalid JSON — fix and try again')).toBeInTheDocument()
    expect(mockCreateUserView).not.toHaveBeenCalled()
  })

  it('renders each saved view as a router Link in the list when views exist (relative, no hardcoded /mos base)', async () => {
    mockListUserViews.mockResolvedValue([SAVED_ROW])
    render(<DevViewsPage />, { wrapper })

    const link = await screen.findByRole('link', { name: 'My view' })
    // A relative react-router `to` — MemoryRouter (no basename configured) resolves it to the
    // bare path; the app's real router supplies the /mos basename at runtime (router.tsx), so
    // this component must never hardcode it.
    expect(link).toHaveAttribute('href', '/dev/views/v1')
    expect(screen.queryByText('No saved views yet')).not.toBeInTheDocument()
  })
})

describe('DevViewsPage — save-time validation gate (P1 review fix-wave item 11 / Sec-M1)', () => {
  it('valid JSON but an invalid spec (compileCompositionSpec fails) is NOT persisted — shows the ValidationError code, never calls createUserView', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<DevViewsPage />, { wrapper })

    const textarea = await screen.findByLabelText('Composition spec (JSON)')
    // Valid JSON, but references an off-registry primitive — compileCompositionSpec must reject
    // this at save time (server-side re-validation is a P2 concern; this is the client gate).
    const invalidSpec = JSON.stringify({
      version: 1,
      panels: [{ id: 'p1', primitive: 'NotARealPrimitive', querySpec: { entity: 'objectives', select: ['id'] } }],
    })
    fireEvent.change(textarea, { target: { value: invalidSpec } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Spec rejected — UNKNOWN_PRIMITIVE/)).toBeInTheDocument()
    expect(mockCreateUserView).not.toHaveBeenCalled()
  })

  it('a spec that compiles successfully IS persisted (the gate does not block valid specs)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<DevViewsPage />, { wrapper })

    await screen.findByText('User Views')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockCreateUserView).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('when unauthenticated (no compiler context yet), Save shows the invalid-JSON status and never calls createUserView', async () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } satisfies AuthState)
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<DevViewsPage />, { wrapper })

    await screen.findByText('User Views')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Invalid JSON — fix and try again')).toBeInTheDocument()
    expect(mockCreateUserView).not.toHaveBeenCalled()
  })
})
