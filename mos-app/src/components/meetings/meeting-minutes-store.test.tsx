// The minutes' store: what the shared editor reads and saves for a Meeting (updated_at conflict check, only
// the allowed blocks stored, a task row stored as its Task id alone) and how the page configures the editor.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { BlockDocumentConflictError, BlockDocumentTooLargeError } from '@/lib/db/block-document'
import { WriteUpConflictError, WriteUpTooLargeError } from '@/lib/db/objective-writeup'

const captured = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('@/components/block-document/block-document-editor', () => ({
  BlockDocumentEditor: (props: Record<string, unknown>) => { captured.props = props; return <div data-testid="doc" /> },
}))
vi.mock('@/components/block-document/use-open-document-record', () => ({ useOpenDocumentRecord: () => vi.fn() }))
vi.mock('@/lib/db/meetings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/meetings')>()),
  readMinutes: vi.fn(), saveMinutes: vi.fn(), listMeetingTasks: vi.fn().mockResolvedValue([]), listStillOpen: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/db/directory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/directory')>()),
  getPeople: vi.fn().mockResolvedValue([]), getDownlinePersonIds: vi.fn().mockResolvedValue([]),
}))
const online = vi.hoisted(() => ({ offline: false }))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => online.offline }))

import { readMinutes, saveMinutes } from '@/lib/db/meetings'
import { MeetingMinutesSlot } from './meeting-minutes-slot'

const TASK = '11111111-1111-4111-8111-111111111111'
const auth = { status: 'authenticated', signOut: async () => {}, viewer: { person: { id: 'me' }, roles: [], isManager: false, accessRoles: [], affiliated: [] } } as unknown as AuthState

async function mount(canEdit = true) {
  render(
    <I18nProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter><MeetingMinutesSlot meetingId="m1" canEdit={canEdit} /></MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
  await waitFor(() => expect(captured.props).not.toBeNull())
  return captured.props as unknown as {
    canEdit: boolean; mentions: boolean; recordLinks: boolean; bare: boolean; documentKey: string
    extension: { blocks: Record<string, unknown> }
    store: { read: () => Promise<unknown>; save: (blocks: unknown[], token: string) => Promise<string> }
  }
}

beforeEach(() => { vi.clearAllMocks(); captured.props = null; online.offline = false })

describe('Meeting minutes store', () => {
  it('is the shared editor with mentions, [[ links and the task blocks, for this Meeting', async () => {
    const props = await mount()
    expect(props).toMatchObject({ documentKey: 'm1', canEdit: true, mentions: true, recordLinks: true, bare: true })
    expect(Object.keys(props.extension.blocks)).toEqual(['taskRow', 'tasksTable'])
  })

  it('reads the minutes with the updated_at they were read at', async () => {
    vi.mocked(readMinutes).mockResolvedValue({ minutes: [{ type: 'paragraph' }], updatedAt: 't1' })
    const props = await mount()
    expect(await props.store.read()).toEqual({ blocks: [{ type: 'paragraph' }], updatedAt: 't1' })
    expect(readMinutes).toHaveBeenCalledWith('m1')
  })

  it('saves conditional on that updated_at and returns the new one', async () => {
    vi.mocked(saveMinutes).mockResolvedValue('t2')
    const props = await mount()
    expect(await props.store.save([{ type: 'paragraph', content: [] }], 't1')).toBe('t2')
    expect(saveMinutes).toHaveBeenCalledWith('m1', [{ type: 'paragraph', content: [] }], 't1')
  })

  it('stores a task row as its Task id alone, and drops a row whose Task was never created', async () => {
    vi.mocked(saveMinutes).mockResolvedValue('t2')
    const props = await mount()
    await props.store.save([
      { type: 'taskRow', props: { taskId: TASK, title: 'leaked title', status: 'Done' }, content: [{ type: 'text', text: 'x' }] },
      { type: 'taskRow', props: { taskId: '' } },
      { type: 'tasksTable', props: {}, children: [] },
    ], 't1')
    expect(saveMinutes).toHaveBeenCalledWith('m1', [
      { type: 'taskRow', props: { taskId: TASK } },
      { type: 'tasksTable' },
    ], 't1')
  })

  it('reports a change made elsewhere and a too-large document as the editor expects', async () => {
    const props = await mount()
    vi.mocked(saveMinutes).mockRejectedValueOnce(new WriteUpConflictError())
    await expect(props.store.save([], 't1')).rejects.toBeInstanceOf(BlockDocumentConflictError)
    vi.mocked(saveMinutes).mockRejectedValueOnce(new WriteUpTooLargeError())
    await expect(props.store.save([], 't1')).rejects.toBeInstanceOf(BlockDocumentTooLargeError)
  })

  it('hands a reader the editor read-only, and an editor read-only while offline', async () => {
    expect((await mount(false)).canEdit).toBe(false)
    captured.props = null
    online.offline = true
    expect((await mount(true)).canEdit).toBe(false)
  })
})
