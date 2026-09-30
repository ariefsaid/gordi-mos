import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/agent-connections', () => ({
  addTrustedAgentClient: vi.fn(),
  listAdminAgentConnections: vi.fn(),
  listOwnAgentConnections: vi.fn(),
  revokeAdminAgentConnection: vi.fn(),
  revokeOwnAgentConnection: vi.fn(),
  setTrustedAgentEnabled: vi.fn(),
}))

import {
  addTrustedAgentClient,
  listAdminAgentConnections,
  listOwnAgentConnections,
  revokeAdminAgentConnection,
  revokeOwnAgentConnection,
  setTrustedAgentEnabled,
  type AdminAgentConnectionRow,
  type OwnAgentConnectionsResult,
} from '@/lib/db/agent-connections'
import { AdminAgentConnectionsPage } from './admin-agent-connections-page'
import { ProfileConnectedAgentsPage } from './profile-connected-agents-page'

const mockListAdmin = vi.mocked(listAdminAgentConnections)
const mockAddTrusted = vi.mocked(addTrustedAgentClient)
const mockListOwn = vi.mocked(listOwnAgentConnections)
const mockRevokeAdmin = vi.mocked(revokeAdminAgentConnection)
const mockRevokeOwn = vi.mocked(revokeOwnAgentConnection)
const mockSetTrusted = vi.mocked(setTrustedAgentEnabled)

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'

function adminRows(): AdminAgentConnectionRow[] {
  return [{
    client_id: CLIENT_ID,
    display_name: 'Northstar',
    enabled: true,
    person_id: 'person-1',
    person_name: 'Ari Example',
    person_archived: false,
    granted_at: '2026-09-01T10:30:00.000Z',
    scopes: 'openid profile',
  }]
}

function ownRows(): OwnAgentConnectionsResult {
  return {
    oauthAvailable: true,
    connections: [{
      clientId: CLIENT_ID,
      displayName: 'Northstar',
      grantedAt: '2026-09-01T10:30:00.000Z',
      scopes: ['openid', 'profile'],
    }],
  }
}

function renderAdminPage() {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/admin/agents']}>
        <AdminAgentConnectionsPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

function renderOwnPage() {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/profile/connected-agents']}>
        <ProfileConnectedAgentsPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockListAdmin.mockResolvedValue(adminRows())
  mockListOwn.mockResolvedValue(ownRows())
  mockAddTrusted.mockResolvedValue(undefined)
  mockRevokeAdmin.mockResolvedValue(true)
  mockRevokeOwn.mockResolvedValue(undefined)
  mockSetTrusted.mockResolvedValue(undefined)
})

describe('connected agent pages', () => {
  it('shows the loaded admin connection and revokes only the selected person and app after confirmation', async () => {
    const user = userEvent.setup()
    mockListAdmin
      .mockResolvedValueOnce(adminRows())
      .mockResolvedValueOnce([{ ...adminRows()[0], person_id: null, person_name: null, person_archived: null, granted_at: null, scopes: null }])
    renderAdminPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Connected agents' })).toBeInTheDocument()
    expect(await screen.findByText('Ari Example')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Northstar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Revoke connection' }))

    const dialog = await screen.findByRole('dialog', { name: 'Revoke Ari Example’s access to Northstar?' })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke connection' }))

    await waitFor(() => expect(mockRevokeAdmin).toHaveBeenCalledWith('person-1', CLIENT_ID))
    expect(await screen.findByText('No one is currently connected.')).toBeInTheDocument()
    expect(mockListAdmin).toHaveBeenCalledTimes(2)
  })

  it('registers an OAuth UUID in canonical lowercase and leaves the new app untrusted', async () => {
    const user = userEvent.setup()
    const uppercaseId = 'A3333333-3333-4333-8333-333333333333'
    mockListAdmin.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      client_id: uppercaseId.toLowerCase(),
      display_name: 'New Agent',
      enabled: false,
      person_id: null,
      person_name: null,
      person_archived: null,
      granted_at: null,
      scopes: null,
    }])
    renderAdminPage()

    await screen.findByRole('heading', { level: 2, name: 'Register an agent app' })
    await user.type(screen.getByLabelText('OAuth client ID'), uppercaseId)
    await user.type(screen.getByLabelText('App name'), 'New Agent')
    await user.click(screen.getByRole('button', { name: 'Add app' }))

    await waitFor(() => expect(mockAddTrusted).toHaveBeenCalledWith({
      client_id: uppercaseId.toLowerCase(),
      display_name: 'New Agent',
    }))
    expect(await screen.findByText('Not trusted')).toBeInTheDocument()
  })

  it('shows a recoverable error when registering a trusted app fails', async () => {
    const user = userEvent.setup()
    mockAddTrusted.mockRejectedValueOnce(new Error('offline'))
    renderAdminPage()

    await user.type(await screen.findByLabelText('OAuth client ID'), CLIENT_ID)
    await user.type(screen.getByLabelText('App name'), 'Northstar')
    await user.click(screen.getByRole('button', { name: 'Add app' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add this app. Check the client ID and try again.')
    expect(mockAddTrusted).toHaveBeenCalledWith({ client_id: CLIENT_ID, display_name: 'Northstar' })
  })

  it('renders the empty admin state when no apps are registered', async () => {
    mockListAdmin.mockResolvedValueOnce([])
    renderAdminPage()

    expect(await screen.findByRole('heading', { name: 'No agent apps registered' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add app' })).toBeInTheDocument()
  })

  it('requires confirmation to distrust a trusted app and reloads its state', async () => {
    const user = userEvent.setup()
    renderAdminPage()
    await screen.findByText('Ari Example')

    await user.click(screen.getByRole('button', { name: 'Distrust Northstar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Distrust Northstar?' })
    expect(within(dialog).getByText(/Existing connections are not revoked; re-trusting this app later may restore access/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Distrust app' }))

    await waitFor(() => expect(mockSetTrusted).toHaveBeenCalledWith(CLIENT_ID, false))
    expect(mockListAdmin).toHaveBeenCalledTimes(2)
  })

  it('enables a registered but untrusted app', async () => {
    const user = userEvent.setup()
    const untrusted = { ...adminRows()[0], enabled: false, person_id: null, person_name: null, person_archived: null, granted_at: null, scopes: null }
    mockListAdmin.mockResolvedValueOnce([untrusted]).mockResolvedValueOnce(adminRows())
    renderAdminPage()

    await user.click(await screen.findByRole('button', { name: 'Trust Northstar' }))
    await waitFor(() => expect(mockSetTrusted).toHaveBeenCalledWith(CLIENT_ID, true))
    expect(mockListAdmin).toHaveBeenCalledTimes(2)
  })

  it('reports an app trust enable failure', async () => {
    const user = userEvent.setup()
    const untrusted = { ...adminRows()[0], enabled: false, person_id: null, person_name: null, person_archived: null, granted_at: null, scopes: null }
    mockListAdmin.mockResolvedValueOnce([untrusted])
    mockSetTrusted.mockRejectedValueOnce(new Error('offline'))
    renderAdminPage()
    await user.click(await screen.findByRole('button', { name: 'Trust Northstar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update this app or connection. Try again.')
  })

  it('refreshes the list and reports when an admin revoke finds no active connection', async () => {
    const user = userEvent.setup()
    mockRevokeAdmin.mockResolvedValueOnce(false)
    renderAdminPage()
    await screen.findByText('Ari Example')

    await user.click(screen.getByRole('button', { name: 'Revoke connection' }))
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Ari Example’s access to Northstar?' })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke connection' }))

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('This connection was no longer active. The list has been refreshed.')
    expect(notice).toHaveClass('agent-connections-admin__notice')
    expect(notice).not.toHaveClass('agent-connections-admin__error')
    expect(screen.queryByRole('dialog', { name: 'Revoke Ari Example’s access to Northstar?' })).not.toBeInTheDocument()
    expect(mockListAdmin).toHaveBeenCalledTimes(2)
  })

  it('renders the admin load error and retries the list', async () => {
    const user = userEvent.setup()
    mockListAdmin.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(adminRows())
    renderAdminPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load connected agents. Try again.')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ari Example')).toBeInTheDocument()
    expect(mockListAdmin).toHaveBeenCalledTimes(2)
  })

  it('shows the current user’s connection and revokes it after confirmation', async () => {
    const user = userEvent.setup()
    mockListOwn.mockResolvedValueOnce(ownRows()).mockResolvedValueOnce({ oauthAvailable: true, connections: [] })
    renderOwnPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Connected agents' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Northstar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Revoke access for Northstar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Revoke access for Northstar?' })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke access' }))

    await waitFor(() => expect(mockRevokeOwn).toHaveBeenCalledWith(CLIENT_ID))
    expect(await screen.findByRole('status')).toHaveTextContent('Access for Northstar was revoked.')
    expect(await screen.findByText('No connected agents')).toBeInTheDocument()
    expect(mockListOwn).toHaveBeenCalledTimes(2)
  })

  it('shows a disabled state when Auth OAuth grant management is unavailable', async () => {
    mockListOwn.mockResolvedValueOnce({ oauthAvailable: false, connections: [] })
    renderOwnPage()

    expect(await screen.findByRole('heading', { name: 'Connected agent controls are unavailable' })).toBeInTheDocument()
    expect(screen.getByText('OAuth agent sign-in is not enabled in this environment, so your connection list is unavailable here.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the own revoke dialog open with a recoverable error when Auth rejects the request', async () => {
    const user = userEvent.setup()
    mockRevokeOwn.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    renderOwnPage()
    await screen.findByRole('heading', { level: 2, name: 'Northstar' })

    await user.click(screen.getByRole('button', { name: 'Revoke access for Northstar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Revoke access for Northstar?' })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke access' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not revoke this connection. Try again.')
    expect(dialog).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Revoke access' }))
    await waitFor(() => expect(mockRevokeOwn).toHaveBeenCalledTimes(2))
  })

  it('keeps an unmapped current-user grant visible and revocable without showing Auth metadata', async () => {
    const user = userEvent.setup()
    mockListOwn.mockResolvedValueOnce({
      oauthAvailable: true,
      connections: [{
        clientId: CLIENT_ID,
        displayName: null,
        grantedAt: '2026-09-01T10:30:00.000Z',
        scopes: [],
      }],
    })
    renderOwnPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Unrecognized agent app' })).toBeInTheDocument()
    expect(screen.getByText(`OAuth client ID: ${CLIENT_ID}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', {
      name: `Revoke access for Unrecognized agent app ${CLIENT_ID}`,
    }))
    const dialog = await screen.findByRole('dialog', { name: 'Revoke access for Unrecognized agent app?' })
    await user.click(within(dialog).getByRole('button', { name: 'Revoke access' }))

    await waitFor(() => expect(mockRevokeOwn).toHaveBeenCalledWith(CLIENT_ID))
  })

  it('renders the own-connection load error and retries the list', async () => {
    const user = userEvent.setup()
    mockListOwn.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ownRows())
    renderOwnPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load your connected agents. Try again.')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Northstar' })).toBeInTheDocument()
    expect(mockListOwn).toHaveBeenCalledTimes(2)
  })
})
