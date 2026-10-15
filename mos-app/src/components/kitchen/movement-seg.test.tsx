import { StrictMode, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { BranchOption, KitchenMovement } from '@/lib/db/kitchen-logs.types'
import { MovementSeg } from './movement-seg'

const branches: BranchOption[] = [
  { id: 'branch-a', code: 'a', name: 'Rumah Rames' },
  { id: 'branch-b', code: 'b', name: 'Radiant' },
  { id: 'branch-c', code: 'c', name: 'Gordi HQ' },
]
const options: KitchenMovement[] = [
  { action: 'produce', destinationBranchId: null },
  { action: 'transfer', destinationBranchId: 'branch-b' },
  { action: 'transfer', destinationBranchId: 'branch-c' },
]

function Harness() {
  const [value, setValue] = useState(options[0])
  return <MovementSeg value={value} options={options} branches={branches} onChange={setValue} />
}

function DeferredHarness() {
  const [value, setValue] = useState(options[0])
  const [pending, setPending] = useState<KitchenMovement | null>(null)
  return (
    <>
      <MovementSeg
        value={value}
        options={options}
        branches={branches}
        onChange={next => { setPending(next); return false }}
      />
      <button
        type="button"
        onClick={() => {
          setPending(null)
          screen.getByRole('button', { name: 'Production' }).focus()
        }}
      >
        Cancel switch
      </button>
      <button
        type="button"
        onClick={() => {
          if (pending) setValue(pending)
          setPending(null)
        }}
      >
        Confirm switch
      </button>
      <button type="button" onClick={() => setValue(options[1])}>
        Change context
      </button>
    </>
  )
}

function ModalConfirmHarness() {
  const [value, setValue] = useState(options[0])
  const [pending, setPending] = useState<KitchenMovement | null>(null)
  return (
    <>
      <MovementSeg
        value={value}
        options={options}
        branches={branches}
        onChange={next => { setPending(next); return false }}
      />
      {pending && (
        <ConfirmDialog
          open
          title="Switch movement?"
          body="Switching clears the staged entries."
          confirmLabel="Switch and clear"
          cancelLabel="Cancel"
          onConfirm={async () => {
            setValue(pending)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}

describe('MovementSeg keyboard contract', () => {
  it('reaches every option in Tab order and selects the focused one with Enter or Space', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><Harness /></I18nProvider>)
    const production = screen.getByRole('button', { name: 'Production' })
    const radiant = screen.getByRole('button', { name: 'Transfer to Radiant' })
    const hq = screen.getByRole('button', { name: 'Transfer to Gordi HQ' })
    expect(production).toHaveAttribute('aria-pressed', 'true')

    await user.tab()
    expect(production).toHaveFocus()
    await user.tab()
    expect(radiant).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(radiant).toHaveAttribute('aria-pressed', 'true')
    expect(production).toHaveAttribute('aria-pressed', 'false')
    await user.tab()
    expect(hq).toHaveFocus()
    await user.keyboard(' ')
    expect(hq).toHaveAttribute('aria-pressed', 'true')
    expect(radiant).toHaveAttribute('aria-pressed', 'false')
  })

  it('requests a choice by click and follows the controlled value', async () => {
    const user = userEvent.setup()
    const requests: KitchenMovement[] = []
    function RequestHarness() {
      const [value, setValue] = useState(options[0])
      return (
        <MovementSeg
          value={value}
          options={options}
          branches={branches}
          onChange={next => { requests.push(next); setValue(next); return true }}
        />
      )
    }
    render(<I18nProvider><RequestHarness /></I18nProvider>)

    await user.click(screen.getByRole('button', { name: 'Transfer to Gordi HQ' }))
    await user.click(screen.getByRole('button', { name: 'Production' }))
    await user.click(screen.getByRole('button', { name: 'Production' }))
    expect(requests).toEqual([options[2], options[0]])
  })

  it('keeps the committed option selected while a request is deferred, then selects its commit', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><DeferredHarness /></I18nProvider>)
    const production = screen.getByRole('button', { name: 'Production' })
    const radiant = screen.getByRole('button', { name: 'Transfer to Radiant' })
    await user.click(radiant)

    expect(production).toHaveAttribute('aria-pressed', 'true')
    expect(radiant).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Confirm switch' }))
    await waitFor(() => expect(radiant).toHaveAttribute('aria-pressed', 'true'))
  })

  it('selects the commit after a guarded ConfirmDialog is confirmed', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><ModalConfirmHarness /></I18nProvider>)
    const production = screen.getByRole('button', { name: 'Production' })
    const radiant = screen.getByRole('button', { name: 'Transfer to Radiant' })

    await user.click(radiant)
    const dialog = await screen.findByRole('dialog', { name: 'Switch movement?' })
    expect(production).toHaveAttribute('aria-pressed', 'true')
    expect(radiant).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Switch and clear' }))

    await waitFor(() => expect(radiant).toHaveAttribute('aria-pressed', 'true'))
    expect(dialog).not.toBeInTheDocument()
  })

  it('keeps the guarded switch working through the StrictMode ModalShell effect replay', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <I18nProvider><ModalConfirmHarness /></I18nProvider>
      </StrictMode>,
    )
    const radiant = screen.getByRole('button', { name: 'Transfer to Radiant' })

    await user.click(radiant)
    const dialog = await screen.findByRole('dialog', { name: 'Switch movement?' })
    await user.click(screen.getByRole('button', { name: 'Switch and clear' }))

    await waitFor(() => expect(radiant).toHaveAttribute('aria-pressed', 'true'))
    expect(dialog).not.toBeInTheDocument()
  })

  it('leaves the committed option selected when a deferred request comes from a click and is never confirmed', async () => {
    const user = userEvent.setup()
    const requests: KitchenMovement[] = []
    render(
      <I18nProvider>
        <MovementSeg
          value={options[0]}
          options={options}
          branches={branches}
          onChange={next => { requests.push(next); return false }}
        />
      </I18nProvider>,
    )
    const production = screen.getByRole('button', { name: 'Production' })
    const radiant = screen.getByRole('button', { name: 'Transfer to Radiant' })

    await user.click(radiant)

    expect(requests).toEqual([options[1]])
    expect(production).toHaveAttribute('aria-pressed', 'true')
    expect(radiant).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies an unrelated controlled context change after a cancelled deferred request', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><DeferredHarness /></I18nProvider>)
    const production = screen.getByRole('button', { name: 'Production' })
    const radiant = screen.getByRole('button', { name: 'Transfer to Radiant' })
    await user.click(radiant)
    await user.click(screen.getByRole('button', { name: 'Cancel switch' }))

    expect(production).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Change context' }))
    await waitFor(() => expect(radiant).toHaveAttribute('aria-pressed', 'true'))
  })

  it('follows an external controlled reset without requesting a change', () => {
    const requests: KitchenMovement[] = []
    function TrackedResetHarness() {
      const [value, setValue] = useState(options[1])
      return (
        <>
          <MovementSeg
            value={value}
            options={options}
            branches={branches}
            onChange={next => { requests.push(next); setValue(next) }}
          />
          <button type="button" onClick={() => setValue(options[0])}>Reset selection</button>
        </>
      )
    }

    render(<I18nProvider><TrackedResetHarness /></I18nProvider>)
    const production = screen.getByRole('button', { name: 'Production' })
    const radiant = screen.getByRole('button', { name: 'Transfer to Radiant' })
    expect(radiant).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }))

    expect(production).toHaveAttribute('aria-pressed', 'true')
    expect(radiant).toHaveAttribute('aria-pressed', 'false')
    expect(requests).toEqual([])
  })

  it('shows no option selected when the controlled value is temporarily absent from the options', () => {
    render(
      <I18nProvider>
        <MovementSeg
          value={{ action: 'transfer', destinationBranchId: 'branch-c' }}
          options={options.slice(0, 2)}
          branches={branches}
          onChange={() => {}}
        />
      </I18nProvider>,
    )

    const group = screen.getByRole('group', { name: 'Action type' })
    expect(within(group).getAllByRole('button').map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
  })

  it('keeps empty, single-option, and disabled strips safe', () => {
    const empty = render(
      <I18nProvider>
        <MovementSeg value={options[0]} options={[]} branches={branches} onChange={() => {}} />
      </I18nProvider>,
    )
    expect(screen.getByRole('group', { name: 'Action type' })).toBeEmptyDOMElement()
    empty.unmount()

    const requests: KitchenMovement[] = []
    const single = render(
      <I18nProvider>
        <MovementSeg value={options[0]} options={[options[0]]} branches={branches} onChange={next => { requests.push(next) }} />
      </I18nProvider>,
    )
    const only = screen.getByRole('button', { name: 'Production' })
    expect(only).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(only)
    expect(requests).toEqual([])
    single.unmount()

    render(
      <I18nProvider>
        <MovementSeg value={options[0]} options={options} branches={branches} onChange={() => {}} disabled />
      </I18nProvider>,
    )
    const group = screen.getByRole('group', { name: 'Action type' })
    expect(within(group).getAllByRole('button').every(button => button.hasAttribute('disabled'))).toBe(true)
  })
})
