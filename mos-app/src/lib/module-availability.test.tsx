import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '@/auth/context'
import type { ModuleId, ViewerModuleAvailability } from '@/lib/db/module-settings'
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

function Probe({ name, moduleId = 'money', roleAdmitted = true }: { name: string; moduleId?: ModuleId; roleAdmitted?: boolean }) {
  const availability = useModuleAvailability()
  return <output aria-label={name}>{`${availability.status}:${availability.isOn(moduleId, roleAdmitted)}`}</output>
}

function renderProbes() {
  return render(<AuthContext.Provider value={viewerState}><Probe name="first" /><Probe name="second" /></AuthContext.Provider>)
}

const availabilityRows = (overrides: Partial<Record<ModuleId, { enabled?: boolean; person_override?: string }>> = {}): ViewerModuleAvailability[] => {
  const ids: ModuleId[] = ['work', 'money', 'cafe', 'roastery', 'ecommerce', 'assistant']
  return ids.map((module_id) => ({
    module_id,
    enabled: overrides[module_id]?.enabled ?? module_id !== 'assistant',
    person_override: (overrides[module_id]?.person_override ?? 'inherit') as ViewerModuleAvailability['person_override'],
    revision: 'rev-1',
  }))
}

beforeEach(() => {
  resetModuleAvailability()
  vi.clearAllMocks()
})

describe('module availability store', () => {
  it('loads once per signed-in session and fails closed while loading', async () => {
    let finish: ((rows: ViewerModuleAvailability[]) => void) | undefined
    dataLayer.getViewerModuleAvailability.mockReturnValue(new Promise((resolve) => { finish = resolve }))

    renderProbes()
    expect(screen.getByLabelText('first')).toHaveTextContent('loading:false')
    expect(screen.getByLabelText('second')).toHaveTextContent('loading:false')
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledTimes(1)

    await act(async () => finish?.(availabilityRows()))
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('ready:true'))
  })

  it('uses each returned org switch and personal override fact', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows({
      money: { enabled: true, person_override: 'block' },
      cafe: { enabled: true, person_override: 'allow' },
      assistant: { enabled: false, person_override: 'allow' },
    }))
    render(<AuthContext.Provider value={viewerState}>
      <Probe name="blocked" />
      <Probe name="allowed" moduleId="cafe" roleAdmitted={false} />
      <Probe name="assistant" moduleId="assistant" />
    </AuthContext.Provider>)
    expect(await screen.findByLabelText('blocked')).toHaveTextContent('ready:false')
    expect(screen.getByLabelText('allowed')).toHaveTextContent('ready:true')
    expect(screen.getByLabelText('assistant')).toHaveTextContent('ready:false')
  })

  it('does not guess facts when a successful response omits a catalog row', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows().slice(1))
    renderProbes()
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('error:false'))
  })

  it('uses an updated org switch on a forced refresh', async () => {
    dataLayer.getViewerModuleAvailability
      .mockResolvedValueOnce(availabilityRows())
      .mockResolvedValueOnce(availabilityRows({ money: { enabled: false } }))
    renderProbes()
    const output = await screen.findByLabelText('first')
    await waitFor(() => expect(output).toHaveTextContent('ready:true'))
    await act(async () => { await loadModuleAvailability({ force: true }) })
    await waitFor(() => expect(output).toHaveTextContent('ready:false'))
  })

  it('fails closed on the first render after the authenticated session changes', async () => {
    dataLayer.getViewerModuleAvailability
      .mockResolvedValueOnce(availabilityRows())
      .mockImplementationOnce(() => new Promise(() => {}))
    const view = render(<AuthContext.Provider value={viewerState}><Probe name="first" /></AuthContext.Provider>)
    expect(await screen.findByLabelText('first')).toHaveTextContent('ready:true')

    const nextViewer: AuthState = {
      ...viewerState,
      viewer: { ...viewerState.viewer, person: { ...viewerState.viewer.person, id: 'person-2' } },
    }
    view.rerender(<AuthContext.Provider value={nextViewer}><Probe name="first" /></AuthContext.Provider>)

    expect(screen.getByLabelText('first')).toHaveTextContent('loading:false')
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledTimes(2)
  })

  it('does not carry a queued refresh or late Allow into the next person session', async () => {
    let finishOld!: (rows: ViewerModuleAvailability[]) => void
    dataLayer.getViewerModuleAvailability
      .mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValueOnce(availabilityRows({ money: { person_override: 'block' } }))
    const view = renderProbes()
    const queued = loadModuleAvailability({ force: true })
    const nextViewer: AuthState = { ...viewerState, viewer: {
      ...viewerState.viewer, person: { ...viewerState.viewer.person, id: 'person-2' },
    } }
    view.rerender(<AuthContext.Provider value={nextViewer}><Probe name="first" /></AuthContext.Provider>)
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('ready:false'))
    await act(async () => {
      finishOld(availabilityRows({ money: { person_override: 'allow' } }))
      await queued
    })
    expect(screen.getByLabelText('first')).toHaveTextContent('ready:false')
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledTimes(2)
  })

  it('clears prior person and org facts when the signed-in session ends', async () => {
    dataLayer.getViewerModuleAvailability.mockResolvedValue(availabilityRows({ money: { enabled: false } }))
    const view = renderProbes()
    expect(await screen.findByLabelText('first')).toHaveTextContent('ready:false')
    view.rerender(<AuthContext.Provider value={{ status: 'unauthenticated' }}><Probe name="first" /><Probe name="second" /></AuthContext.Provider>)
    await waitFor(() => expect(screen.getByLabelText('first')).toHaveTextContent('idle:false'))
    expect(dataLayer.getViewerModuleAvailability).toHaveBeenCalledOnce()
  })

  it('keeps same-session facts after an error and retry replaces them', async () => {
    dataLayer.getViewerModuleAvailability
      .mockResolvedValueOnce(availabilityRows())
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(availabilityRows({ money: { enabled: false } }))

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
