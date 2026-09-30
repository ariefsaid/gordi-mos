import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

const fake = vi.hoisted(() => ({ document: [] as unknown[] }))

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => fake,
  BlockNoteViewRaw: ({ onChange, editable }: { onChange?: () => void; editable?: boolean }) => (
    <div data-testid="bn" data-editable={String(editable)}>
      <button type="button" onClick={() => { fake.document = [...fake.document, { type: 'paragraph' }]; onChange?.() }}>type</button>
    </div>
  ),
}))

vi.mock('@/lib/db/objective-writeup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/objective-writeup')>()),
  readWriteUp: vi.fn(),
  saveWriteUp: vi.fn(),
}))

import { readWriteUp, saveWriteUp, WriteUpConflictError, WriteUpTooLargeError } from '@/lib/db/objective-writeup'
import { ObjectiveWriteupEditor } from './objective-writeup-editor'

const read = vi.mocked(readWriteUp)
const save = vi.mocked(saveWriteUp)

async function mount(props: { canEdit?: boolean; archived?: boolean; onDirtyChange?: (d: boolean) => void } = {}) {
  const view = render(
    <I18nProvider>
      <ObjectiveWriteupEditor objectiveId="o1" canEdit={props.canEdit ?? true} archived={props.archived ?? false} onDirtyChange={props.onDirtyChange} />
    </I18nProvider>,
  )
  await act(async () => { await Promise.resolve() })
  return view
}
const typeOnce = () => fireEvent.click(screen.getByText('type'))

beforeEach(() => {
  vi.useFakeTimers()
  fake.document = []
  read.mockResolvedValue({ writeUp: [], updatedAt: 't1' })
  save.mockResolvedValue('t2')
})
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('ObjectiveWriteupEditor', () => {
  it('renders editable for content authority and read-only otherwise or when archived', async () => {
    const a = await mount()
    expect(screen.getByTestId('bn').dataset.editable).toBe('true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    a.unmount()
    read.mockResolvedValue({ writeUp: [{ type: 'paragraph' }], updatedAt: 't1' })
    const b = await mount({ canEdit: false })
    expect(screen.getByTestId('bn').dataset.editable).toBe('false')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('note').textContent).toMatch(/not edit/)
    b.unmount()
    await mount({ archived: true })
    expect(screen.getByTestId('bn').dataset.editable).toBe('false')
  })

  it('does not save per keystroke; saves once after the idle debounce', async () => {
    await mount()
    typeOnce(); typeOnce(); typeOnce()
    await act(async () => { vi.advanceTimersByTime(2900) })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('o1', fake.document, 't1')
  })

  it('saves on explicit Save and on blur, adopts the returned updated_at, and reports Saved', async () => {
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('Saved')
    typeOnce()
    await act(async () => { fireEvent.blur(screen.getByText('type')) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][2]).toBe('t2')
  })

  it('shows Saving while in flight and queues later edits behind the one save', async () => {
    let finish: (v: string) => void = () => {}
    save.mockImplementationOnce(() => new Promise<string>((r) => { finish = r }))
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('Saving')
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => { finish('t2') })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][2]).toBe('t2')
  })

  it('shows Failed with Retry, keeps the text, and retries', async () => {
    save.mockRejectedValueOnce(new Error('boom'))
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('Save failed')
    expect(screen.getByTestId('bn').dataset.editable).toBe('true')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status').textContent).toContain('Saved')
  })

  it('refuses on a conflict: says changed elsewhere, never retries, keeps the text', async () => {
    save.mockRejectedValueOnce(new WriteUpConflictError())
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('changed elsewhere')
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByTestId('bn')).toBeTruthy()
  })

  it('reports an oversize refusal as a failure with its own message', async () => {
    save.mockRejectedValueOnce(new WriteUpTooLargeError())
    await mount()
    typeOnce()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('status').textContent).toContain('too long')
  })

  it('reports dirtiness for the leave guard until the save lands', async () => {
    const onDirtyChange = vi.fn()
    await mount({ onDirtyChange })
    typeOnce()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})
