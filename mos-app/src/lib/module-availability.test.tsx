import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '@/auth/context'
import { useModuleAvailability, loadModuleAvailability, resetModuleAvailability } from './module-availability'

const dataLayer = vi.hoisted(() => ({ getViewerModuleAvailability: vi.fn() }))
vi.mock('@/lib/db/module-settings', () => dataLayer)

const viewerState: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Viewer', must_change_password: false },
    roles: [], isManager: false, accessRoles: [], affiliated: [],
  },
  signOut: vi.fn(),
}

function Probe({ name, onIsOn }: { name: string; onIsOn?: (enabled: boolean) => void }) {
  const availability = useModuleAvailability()
  const enabled = availability.isOn('money')
  onIsOn?.(enabled)
  return <output aria-label={name}>{`${availability.status}:${enabled}`}</output>
}

function renderProbes() {
  return render(<AuthContext.Provider value={viewerState}><Probe name="first" /><Probe name="second" /></AuthContext.Provider>)
}

const row = (module_id: 'work' | 'money', enabled: boolean) => ({ module_id, enabled, revision: 'rev-1' })

beforeEach(() => {
  resetModuleAvailability()
  vi.clearAllMocks()
})

describe('module availability store', () => {
  it('loads once per signed-in session and fails closed while loading', async () => {
    let finish: ((rows: ReturnType<typeof row>[]) => void) | undefined
    dataLayer.getViewerModuleAvailability.mockReturnValue(new Promise((resolve) => { finish = resolve }))

    renderProbes()
    expect(screen.getByLabelText('first')).toHaveTextContent('loading:false')
    expect(screen.getByLabelText('second')).toHaveTextContent('loading:false')
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledTimes(1)

    await act(async () => finish?.([row('money', true)]))
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('ready:true'))
  })

  it('defaults modules missing from a successful availability response to enabled', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue([row('work', true)])
    renderProbes()
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('ready:true'))
  })

  it('fails closed on the first render after the authenticated session changes', async () => {
    dataLayer.getViewerModuleAvailability
      .mockResolvedValueOnce([row('money', true)])
      .mockImplementationOnce(() => new Promise(() => {}))
    const observed: boolean[] = []
    const view = render(<AuthContext.Provider value={viewerState}><Probe name="first" /></AuthContext.Provider>)
    expect(await screen.findByLabelText('first')).toHaveTextContent('ready:true')

    const nextViewer: AuthState = {
      ...viewerState,
      viewer: { ...viewerState.viewer, person: { ...viewerState.viewer.person, id: 'person-2' } },
    }
    observed.length = 0
    view.rerender(<AuthContext.Provider value={nextViewer}><Probe name="first" onIsOn={(enabled) => observed.push(enabled)} /></AuthContext.Provider>)

    expect(observed[0]).toBe(false)
    expect(screen.getByLabelText('first')).toHaveTextContent('loading:false')
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledTimes(2)
  })

  it('clears the prior org settings when the signed-in session ends', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue([{ module_id: 'money', enabled: false, revision: 'rev-1' }])
    const view = renderProbes()
    expect(await screen.findByLabelText('first')).toHaveTextContent('ready:false')
    view.rerender(<AuthContext.Provider value={{ status: 'unauthenticated' }}><Probe name="first" /><Probe name="second" /></AuthContext.Provider>)
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('idle:false'))
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledOnce()
  })

  it('keeps the last known value after an error and retry loads again', async () => {
    dataLayer.getViewerModuleAvailability
      .mockResolvedValueOnce([row('money', true)])
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([row('money', false)])

    let retryAvailability: (() => void) | undefined
    function RetryProbe() {
      const availability = useModuleAvailability()
      retryAvailability = availability.retry
      return <button type="button" onClick={availability.retry}>{`${availability.status}:${availability.isOn('money')}`}</button>
    }

    render(<AuthContext.Provider value={viewerState}><RetryProbe /></AuthContext.Provider>)
    const button = await screen.findByRole('button', { name: 'ready:true' })
    await act(async () => { await loadModuleAvailability({ force: true }) })
    await waitFor(() => expect(button).toHaveAccessibleName('error:true'))
    await act(async () => { retryAvailability?.() })
    await waitFor(() => expect(button).toHaveAccessibleName('ready:false'))
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledTimes(3)
  })
})
