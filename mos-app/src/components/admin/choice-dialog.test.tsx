import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
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

  it.each(['en', 'id'] as const)('keeps keyboard focus on a row during save in %s', async (locale) => {
    const user = userEvent.setup()
    let settleWrite: () => void = () => {}
    const write = vi.fn(() => new Promise<void>((resolve) => { settleWrite = resolve }))
    const refresh = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(
      <I18nProvider initialLocale={locale}>
        <ChoiceDialog
          title="Pick"
          choices={choices}
          saved={new Set(['a'])}
          saveLabel="Save picks"
          write={write}
          refresh={refresh}
          onClose={onClose}
        />
      </I18nProvider>,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Bravo' })
    checkbox.focus()
    await user.keyboard(' ')
    expect(checkbox).toBeChecked()
    expect(document.activeElement).toBe(checkbox)

    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-busy', 'true'))
    expect(checkbox).toHaveAttribute('aria-disabled', 'true')
    expect(checkbox).toBeEnabled()
    expect(document.activeElement).toBe(checkbox)

    await user.keyboard(' ')
    expect(checkbox).toBeChecked()
    expect(document.activeElement).toBe(checkbox)
    expect(write).toHaveBeenCalledOnce()

    settleWrite()
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
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

  it('stays open with visible retry state when refresh fails after writes, and only claims saved once reread succeeds', async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValue(undefined)
    const { write, onClose } = setup({ refresh })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bravo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))

    // Write succeeded
    await waitFor(() => expect(write).toHaveBeenCalledWith({ id: 'b', wanted: true }, expect.anything()))

    // Refresh failed: dialog must not close and must not claim saved
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load people. Try again.")

    // Visible retry action is available
    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    expect(retryBtn).toBeInTheDocument()

    // Retrying refresh succeeds and closes claiming saved
    fireEvent.click(retryBtn)
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true))
  })

  it('retains failed writes after the refresh retry succeeds', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('write failed'))
    const refresh = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(undefined)
    const { onClose } = setup({ write, refresh })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bravo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))
    await screen.findByText("Couldn't load people. Try again.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText("1 change didn't save. Retry it, or close and try again later.")
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without claiming saved when user cancels after a failed refresh', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('refresh failed'))
    const { write, onClose } = setup({ refresh })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bravo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save picks' }))

    await waitFor(() => expect(write).toHaveBeenCalledWith({ id: 'b', wanted: true }, expect.anything()))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load people. Try again.")

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledWith(false)
  })
})
