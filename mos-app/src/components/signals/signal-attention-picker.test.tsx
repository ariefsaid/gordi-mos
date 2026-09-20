import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalAttentionPicker } from './signal-attention-picker'

function renderPicker(onChange = vi.fn()) {
  render(
    <I18nProvider>
      <div onKeyDown={(event) => { if (event.key === 'Escape') onChange('host' as never) }}>
        <SignalAttentionPicker id="test-signal-attention" value="FYI" onChange={onChange} />
      </div>
    </I18nProvider>,
  )
  return onChange
}

describe('SignalAttentionPicker', () => {
  it('uses the shared listbox keyboard contract and commits the selected attention', async () => {
    const onChange = renderPicker()
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: /attention.*FYI/i })
    expect(trigger).toHaveAttribute('id', 'test-signal-attention')
    await user.click(trigger)

    const listbox = screen.getByRole('listbox', { name: /attention/i })
    expect(trigger).toHaveAttribute('aria-controls', 'test-signal-attention-listbox')
    expect(listbox).toHaveAttribute('id', 'test-signal-attention-listbox')
    expect(listbox).toHaveFocus()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('Needs attention')
    expect(screen.queryByRole('listbox', { name: /attention/i })).not.toBeInTheDocument()
  })

  it('dismisses on Escape, returns focus to the trigger, and does not bubble to the host', async () => {
    const onChange = vi.fn()
    renderPicker(onChange)
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: /attention.*FYI/i })
    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: /attention/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onChange).not.toHaveBeenCalledWith('host')
  })

  // #855 addendum B1: the menu used to render only "below, left-aligned" with no room check —
  // at 768 it hung off the dialog's bottom edge onto the scrim, and at 390 it grew down over the
  // primary Share Signal button. Wiring signal-attention-placement's flip decision fixes it.
  it('flips the menu above the trigger when it would not fit below the viewport (B1)', async () => {
    renderPicker()
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: /attention.*FYI/i })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: /attention/i })
    expect(listbox).not.toHaveClass('signal-attention-picker-options--up')

    // Trigger sits low in a short viewport; the menu (171px, matching the live #768 geometry
    // signal-attention-placement.test.ts pins) cannot fit below it.
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 710.8, bottom: 754.8, left: 16, right: 100, width: 84, height: 44, x: 16, y: 710.8, toJSON: () => ({}),
    })
    vi.spyOn(listbox, 'getBoundingClientRect').mockReturnValue({
      top: 0, bottom: 171, left: 0, right: 220, width: 220, height: 171, x: 0, y: 0, toJSON: () => ({}),
    })
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true })
    act(() => { window.dispatchEvent(new Event('resize')) })

    await waitFor(() => expect(screen.getByRole('listbox', { name: /attention/i })).toHaveClass('signal-attention-picker-options--up'))
  })

  it('re-seats the active option when the controlled attention changes', async () => {
    const onChange = vi.fn()
    const view = render(
      <I18nProvider>
        <SignalAttentionPicker id="test-signal-attention" value="FYI" onChange={onChange} />
      </I18nProvider>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /attention.*FYI/i }))
    await user.click(screen.getByRole('option', { name: /urgent/i }))
    view.rerender(
      <I18nProvider>
        <SignalAttentionPicker id="test-signal-attention" value="Urgent" onChange={onChange} />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: /attention.*urgent/i }))
    const urgent = screen.getByRole('option', { name: /urgent/i })
    expect(urgent).toHaveAttribute('data-active', 'true')
  })
})
