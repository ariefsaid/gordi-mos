// The create-task frame a record pushes onto its panel stack: it prefills the Project/Process,
// hands the created task back, and never lets a typed draft vanish without a confirm.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { TaskSurfaceProps } from '@/components/tasks/task-surface'
import { CatalogTaskCreateFrame } from './catalog-task-create-frame'
import { createCatalogTaskCreateSession } from './catalog-task-create-session'

const surface = vi.hoisted(() => ({ props: null as null | TaskSurfaceProps }))
vi.mock('@/components/tasks/task-surface', () => ({
  TaskSurface: (props: TaskSurfaceProps) => { surface.props = props; return <p>create form</p> },
}))

const INTENT = { kind: 'back', via: 'internal-back', from: { key: 'task-create:wl-1', owner: 'work' }, depth: 1 } as const

function mount() {
  const session = createCatalogTaskCreateSession()
  const onCreated = vi.fn()
  const onLeave = vi.fn()
  render(<I18nProvider><CatalogTaskCreateFrame workLineId="wl-1" session={session} onCreated={onCreated} onLeave={onLeave} /></I18nProvider>)
  return { session, onCreated, onLeave }
}

describe('CatalogTaskCreateFrame', () => {
  it('opens the create form for the record\'s Project/Process, in the panel, without navigating after save', () => {
    mount()
    expect(surface.props).toMatchObject({ mode: 'create', taskId: null, createInitialValues: { workLineId: 'wl-1' }, createRedirect: null, showPanelUtility: false })
  })

  it('hands the created task id back and leaves the draft clean', async () => {
    const { session, onCreated } = mount()
    surface.props?.onDirtyChange?.(true)
    expect(session.dirty).toBe(true)
    await surface.props?.onTaskCreated?.('t-new')
    expect(onCreated).toHaveBeenCalledWith('t-new')
    expect(session.dirty).toBe(false)
  })

  it('the form\'s own Cancel asks the host to go back', () => {
    const { onLeave } = mount()
    surface.props?.onRequestLeave?.(() => {})
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('lets a clean frame go, and asks before discarding a typed draft', async () => {
    const user = userEvent.setup()
    const { session } = mount()
    await expect(session.guard(INTENT)).resolves.toEqual({ decision: 'allow' })

    surface.props?.onDirtyChange?.(true)
    const stay = session.guard(INTENT)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Discard unsaved changes?')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(stay).resolves.toEqual({ decision: 'deny' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(session.dirty).toBe(true)

    const leave = session.guard(INTENT)
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))
    await expect(leave).resolves.toEqual({ decision: 'allow' })
    expect(session.dirty).toBe(false)
  })
})
