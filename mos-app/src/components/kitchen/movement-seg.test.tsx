import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
          screen.getByRole('tab', { name: 'Production' }).focus()
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
  it('uses one Tab stop and moves focus and selection with arrows, Home, and End', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><Harness /></I18nProvider>)
    const tabs = screen.getAllByRole('tab')

    expect(tabs.map(tab => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs.map(tab => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])

    await user.keyboard('{End}')
    expect(tabs[2]).toHaveFocus()
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveFocus()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('wraps ArrowLeft and keeps Home and End navigation tied to controlled requests', () => {
    const requests: KitchenMovement[] = []
    function NavigationHarness() {
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
    render(
      <I18nProvider>
        <NavigationHarness />
      </I18nProvider>,
    )
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()

    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(tabs[2]).toHaveFocus()
    expect(requests).toEqual([options[2]])

    fireEvent.keyDown(tabs[2], { key: 'Home' })
    expect(tabs[0]).toHaveFocus()
    fireEvent.keyDown(tabs[0], { key: 'End' })
    expect(tabs[2]).toHaveFocus()
    expect(requests).toEqual([options[2], options[0], options[2]])
  })

  it('keeps the committed tab focused while a request is deferred, then focuses its commit', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><DeferredHarness /></I18nProvider>)
    const production = screen.getByRole('tab', { name: 'Production' })
    const cikal = screen.getByRole('tab', { name: 'Transfer to Radiant' })
    production.focus()
    fireEvent.keyDown(production, { key: 'ArrowRight' })

    expect(production).toHaveAttribute('aria-selected', 'true')
    expect(cikal).toHaveAttribute('aria-selected', 'false')
    expect(production).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Confirm switch' }))
    await waitFor(() => {
      expect(cikal).toHaveAttribute('aria-selected', 'true')
      expect(cikal).toHaveFocus()
    })
  })

  it('focuses the committed tab after a guarded ConfirmDialog returns focus on confirm', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><ModalConfirmHarness /></I18nProvider>)
    const production = screen.getByRole('tab', { name: 'Production' })
    const cikal = screen.getByRole('tab', { name: 'Transfer to Radiant' })
    production.focus()

    await user.keyboard('{ArrowRight}')
    const dialog = await screen.findByRole('dialog', { name: 'Switch movement?' })
    expect(production).toHaveAttribute('aria-selected', 'true')
    expect(cikal).toHaveAttribute('aria-selected', 'false')
    await user.click(screen.getByRole('button', { name: 'Switch and clear' }))

    await waitFor(() => {
      expect(cikal).toHaveAttribute('aria-selected', 'true')
      expect(cikal).toHaveFocus()
    })
    expect(dialog).not.toBeInTheDocument()
  })

  it('restores committed focus for the same deferred request from pointer activation', async () => {
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
    const production = screen.getByRole('tab', { name: 'Production' })
    const cikal = screen.getByRole('tab', { name: 'Transfer to Radiant' })

    await user.click(cikal)

    expect(requests).toEqual([options[1]])
    expect(production).toHaveAttribute('aria-selected', 'true')
    expect(cikal).toHaveAttribute('aria-selected', 'false')
    expect(production).toHaveFocus()
  })

  it('clears a cancelled deferred focus before an unrelated controlled context change', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><DeferredHarness /></I18nProvider>)
    const production = screen.getByRole('tab', { name: 'Production' })
    const cikal = screen.getByRole('tab', { name: 'Transfer to Radiant' })
    production.focus()
    fireEvent.keyDown(production, { key: 'ArrowRight' })
    await user.click(screen.getByRole('button', { name: 'Cancel switch' }))

    expect(production).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Change context' }))
    await waitFor(() => expect(cikal).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByRole('button', { name: 'Change context' })).toHaveFocus()
  })

  it('focuses an already-selected Home target after an external controlled reset without requesting a change', () => {
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
    const production = screen.getByRole('tab', { name: 'Production' })
    const cikal = screen.getByRole('tab', { name: 'Transfer to Radiant' })
    cikal.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }))

    expect(cikal).toHaveFocus()
    expect(production).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(cikal, { key: 'Home' })

    expect(production).toHaveFocus()
    expect(requests).toEqual([])
  })

  it('keeps one usable tab stop when the controlled value is temporarily absent from the options', () => {
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

    expect(screen.getAllByRole('tab').map(tab => tab.getAttribute('tabindex'))).toEqual(['0', '-1'])
  })

  it('keeps empty, single-option, and disabled strips safe', () => {
    const empty = render(
      <I18nProvider>
        <MovementSeg value={options[0]} options={[]} branches={branches} onChange={() => {}} />
      </I18nProvider>,
    )
    expect(screen.getByRole('tablist', { name: 'Action type' })).toBeEmptyDOMElement()
    empty.unmount()

    const single = render(
      <I18nProvider>
        <MovementSeg value={options[0]} options={[options[0]]} branches={branches} onChange={() => {}} />
      </I18nProvider>,
    )
    const only = screen.getByRole('tab', { name: 'Production' })
    expect(only).toHaveAttribute('tabindex', '0')
    only.focus()
    fireEvent.keyDown(only, { key: 'ArrowRight' })
    fireEvent.keyDown(only, { key: 'Home' })
    fireEvent.keyDown(only, { key: 'End' })
    expect(only).toHaveFocus()
    single.unmount()

    render(
      <I18nProvider>
        <MovementSeg value={options[0]} options={options} branches={branches} onChange={() => {}} disabled />
      </I18nProvider>,
    )
    const disabledTabs = screen.getAllByRole('tab')
    expect(disabledTabs.every(tab => tab.hasAttribute('disabled'))).toBe(true)
    expect(disabledTabs.map(tab => tab.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1'])
  })
})
