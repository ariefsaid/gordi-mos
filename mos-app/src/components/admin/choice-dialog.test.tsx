import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChoiceDialog, type ChoiceChange } from './choice-dialog'

afterEach(cleanup)

const choices = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo' },
  { id: 'c', label: 'Charlie', lockedReason: 'Only admin' },
]

function setup(overrides: Partial<Parameters<typeof ChoiceDialog>[0]> = {}) {
  const write = vi.fn<(change: ChoiceChange) => Promise<void>>().mockResolvedValue(undefined)
  const refresh = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(
    <ChoiceDialog
      title="Pick"
      choices={choices}
      saved={new Set(['a'])}
      saveLabel="Save picks"
      write={write}
      refresh={refresh}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { write, refresh, onClose }
}

describe('ChoiceDialog: one Save, the same per-row writes', () => {
  it('writes nothing while ticking, then each change once on Save, in the given order', async () => {
    const order = (changes: ChoiceChange[]) => [...changes.filter((c) => !c.wanted), ...changes.filter((c) => c.wanted)]
    const { write, refresh, onClose } = setup({ order })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bravo' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }))
    expect(write).not.toHaveBeenCalled()
    expect(screen.getByText('Adding 1 · Removing 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
    expect(write.mock.calls.map(([c]) => c)).toEqual([{ id: 'a', wanted: false }, { id: 'b', wanted: true }])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('keeps Save off until something changes, and a locked row cannot change', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Save picks' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Charlie' })).toBeDisabled()
    expect(screen.getByText('Only admin')).toBeInTheDocument()
  })

  it('stays open on a failed row with Retry, which repeats only that write', async () => {
    const write = vi.fn<(change: ChoiceChange) => Promise<void>>()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined)
    const { onClose } = setup({ write })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bravo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))
    await screen.findByText("1 change didn't save. Retry it, or close and try again later.")
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry Bravo' }))
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
    expect(write).toHaveBeenLastCalledWith({ id: 'b', wanted: true }, expect.anything())
  })

  it('asks first for a guarded change; Cancel writes nothing, confirming writes', async () => {
    const confirms = (changes: ChoiceChange[]) => changes.some((c) => c.id === 'b')
      ? [{ title: 'Make them Bravo?', body: 'Bravo can do more.', confirmLabel: 'Make Bravo' }] : []
    const { write, onClose } = setup({ confirms })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bravo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))
    expect(await screen.findByText('Make them Bravo?')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!)
    expect(write).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Make Bravo' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
    expect(write).toHaveBeenCalledOnce()
  })
})
