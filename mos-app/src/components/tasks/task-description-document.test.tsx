import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'

const captured = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
const host = vi.hoisted(() => ({ current: null as null | { session: unknown; push: (entry: unknown) => void; openPage: () => void } }))

vi.mock('@/components/block-document/block-document-editor', () => ({
  BlockDocumentEditor: (props: Record<string, unknown>) => { captured.props = props; return <div data-testid="doc" /> },
}))
vi.mock('@/shell/overlay-host', () => ({ useOptionalOverlayHost: () => host.current }))
vi.mock('@/components/catalog/use-catalog-record-overlay', () => ({
  useCatalogRecordEntryFactory: () => ({ buildEntry: (kind: string, id: string) => ({ key: `${kind}:${id}` }) }),
}))
vi.mock('@/components/signals/signal-record-host', () => ({ SignalRecordHost: () => null }))
vi.mock('@/lib/db/task-body', () => ({ readTaskBody: vi.fn(), saveTaskBody: vi.fn() }))

import { readTaskBody, saveTaskBody } from '@/lib/db/task-body'
import { TaskDescriptionDocument } from './task-description-document'

function Where() { return <p data-testid="where">{useLocation().pathname}</p> }

async function mount(props: { canEdit: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/work/tasks/task-1']}>
        <TaskDescriptionDocument taskId="task-1" {...props} />
        <Where />
      </MemoryRouter>
    </I18nProvider>,
  )
  await screen.findByTestId('doc')
  return captured.props as {
    documentKey: string; canEdit: boolean; mentions: boolean; recordLinks: boolean; checklistNote: boolean
    store: { read: () => Promise<unknown>; save: (b: unknown[], t: string) => Promise<string> }
    onOpenRecord: (ref: { kind: string; id: string }) => void
    copy: { readOnly: string }
  }
}

beforeEach(() => { vi.clearAllMocks(); host.current = null })

describe('Task description document', () => {
  it('is the shared editor with mentions, record links and free-note checkboxes, for this Task', async () => {
    const props = await mount({ canEdit: true })
    expect(props).toMatchObject({ documentKey: 'task-1', canEdit: true, mentions: true, recordLinks: true, checklistNote: true })
  })

  it('reads and saves this Task body, with the updated_at token', async () => {
    vi.mocked(readTaskBody).mockResolvedValue({ blocks: [], updatedAt: 't1' })
    vi.mocked(saveTaskBody).mockResolvedValue('t2')
    const props = await mount({ canEdit: true })
    await props.store.read()
    expect(readTaskBody).toHaveBeenCalledWith('task-1')
    expect(await props.store.save([{ type: 'paragraph' }], 't1')).toBe('t2')
    expect(saveTaskBody).toHaveBeenCalledWith('task-1', [{ type: 'paragraph' }], 't1', null)
  })

  it('hands a viewer the read-only document: no edit rights, and the page (not the document) says view-only', async () => {
    const props = await mount({ canEdit: false })
    expect(props.canEdit).toBe(false)
    expect(props.copy.readOnly).toBe('')
  })

  it('opens a record chip on its own page when there is no panel stack', async () => {
    const props = await mount({ canEdit: true })
    act(() => props.onOpenRecord({ kind: 'objective', id: 'o1' }))
    expect(screen.getByTestId('where').textContent).toBe('/work/objectives/o1')
    act(() => props.onOpenRecord({ kind: 'project', id: 'w1' }))
    expect(screen.getByTestId('where').textContent).toBe('/work/projects/w1')
  })

  it('opens a record chip in the panel stack when there is one', async () => {
    const push = vi.fn()
    host.current = { session: { frames: [{ entry: { owner: 'tasks' } }] }, push, openPage: vi.fn() }
    const props = await mount({ canEdit: true })
    act(() => props.onOpenRecord({ kind: 'task', id: 'k1' }))
    act(() => props.onOpenRecord({ kind: 'project', id: 'w1' }))
    act(() => props.onOpenRecord({ kind: 'signal', id: 's1' }))
    expect(push.mock.calls.map(([entry]) => (entry as { key: string }).key)).toEqual(['task:k1', 'work-line:w1', 'signal:s1'])
    expect(screen.getByTestId('where').textContent).toBe('/work/tasks/task-1')
  })
})
