import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { RecordViewer } from '@/components/records/record-viewer'
import type { RecordViewerAdapter } from '@/components/records/record-viewer.types'
import { CommandMenu } from './command-menu'
import { useCommandMenu } from './use-command-menu'

vi.mock('@/lib/db/tasks', () => ({ searchTasksByTitle: vi.fn(async () => []) }))
vi.mock('@/lib/db/signals', () => ({ searchSignalsByBody: vi.fn(async () => []) }))
vi.mock('@/lib/db/follow-ups', () => ({ searchFollowUpsByCounterparty: vi.fn(async () => []) }))
vi.mock('@/lib/db/directory', () => ({ searchPeopleByName: vi.fn(async () => []) }))
vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    viewer: { person: { id: 'p1' }, roles: [], isManager: false, accessRoles: ['admin'], affiliated: [] },
    signOut: vi.fn(),
  }),
}))

const adapter: RecordViewerAdapter = {
  kind: 'task',
  id: 'task-1',
  title: 'Restock oat milk',
  typeLabel: 'Task',
  metadata: [],
  relations: [],
  contentSlots: [],
  activity: [],
  actions: [{ id: 'archive', label: 'Archive task', intent: 'danger', run: vi.fn() }],
  headerOverflowActionIds: ['archive'],
  permission: { readOnly: false, allowedActionIds: ['archive'] },
  state: 'ready',
}

function Shell() {
  const palette = useCommandMenu()
  return (
    <>
      <RecordViewer adapter={adapter} mode="panel" onOpenPage={vi.fn()} />
      <CommandMenu open={palette.open} mode={palette.mode} onClose={() => palette.setOpen(false)} onShareSignal={vi.fn()} />
    </>
  )
}

describe('a record menu under the command palette', () => {
  it('⌘K over an open ⋯ menu: Escape closes the palette, and the menu is already closed', () => {
    render(<I18nProvider><MemoryRouter><Shell /></MemoryRouter></I18nProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menu', { name: 'More actions' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = screen.getByRole('combobox')
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'More actions' })).not.toBeInTheDocument()
  })
})
