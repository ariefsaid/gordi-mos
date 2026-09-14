import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useHref } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordViewer } from './record-viewer'
import type { RecordKind, RecordViewerAdapter } from './record-viewer.types'

const writeText = vi.fn().mockResolvedValue(undefined)

function makeAdapter(kind: RecordKind): RecordViewerAdapter {
  return {
    kind,
    id: `${kind}-1`,
    title: `${kind} record`,
    typeLabel: kind,
    metadata: [],
    relations: [],
    contentSlots: [],
    activity: [],
    actions: [{ id: 'archive', label: 'Archive', intent: 'secondary', run: vi.fn() }],
    headerOverflowActionIds: ['archive'],
    permission: { readOnly: false, allowedActionIds: ['archive'] },
    state: 'ready',
  }
}

function DomainRecord({ kind, canonicalPath }: { kind: RecordKind; canonicalPath: string }) {
  // The domain owns the route; useHref is the host boundary that applies the router basename.
  const canonicalHref = useHref(canonicalPath)
  return <RecordViewer adapter={makeAdapter(kind)} mode="panel" canonicalHref={canonicalHref} />
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

describe('RecordViewer canonical Copy link', () => {
  it.each([
    { kind: 'work-line' as const, parent: '/mos/work/projects?record=work-line-1', canonicalPath: '/work/projects/work-line-1' },
    { kind: 'task' as const, parent: '/mos/work/tasks?record=task-1', canonicalPath: '/work/tasks/task-1' },
    { kind: 'signal' as const, parent: '/mos/work/signals?record=signal-1', canonicalPath: '/work/signals/signal-1' },
  ])('copies the $kind canonical record URL instead of the parent collection URL', async ({ kind, parent, canonicalPath }) => {
    const user = userEvent.setup()
    // userEvent installs its own clipboard stub during setup; replace it with the assertion spy.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(
      <MemoryRouter basename="/mos" initialEntries={[parent]}>
        <I18nProvider>
          <DomainRecord kind={kind} canonicalPath={canonicalPath} />
        </I18nProvider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }))

    expect(writeText).toHaveBeenCalledWith(new URL(`/mos${canonicalPath}`, window.location.origin).href)
  })
})
