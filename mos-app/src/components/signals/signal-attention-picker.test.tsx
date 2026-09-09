import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalAttentionPicker } from './signal-attention-picker'

function renderPicker(onChange = vi.fn()) {
  render(
    <I18nProvider>
      <div onKeyDown={(event) => { if (event.key === 'Escape') onChange('host' as never) }}>
        <SignalAttentionPicker value="FYI" onChange={onChange} />
      </div>
    </I18nProvider>,
  )
  return onChange
}

describe('SignalAttentionPicker', () => {
  it('uses the shared listbox keyboard contract and commits the selected attention', async () => {
    const onChange = renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /attention.*FYI/i }))

    const listbox = screen.getByRole('listbox', { name: /attention/i })
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

  it('re-seats the active option when the controlled attention changes', async () => {
    const onChange = vi.fn()
    const view = render(
      <I18nProvider>
        <SignalAttentionPicker value="FYI" onChange={onChange} />
      </I18nProvider>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /attention.*FYI/i }))
    await user.click(screen.getByRole('option', { name: /urgent/i }))
    view.rerender(
      <I18nProvider>
        <SignalAttentionPicker value="Urgent" onChange={onChange} />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: /attention.*urgent/i }))
    const urgent = screen.getByRole('option', { name: /urgent/i })
    expect(urgent).toHaveAttribute('data-active', 'true')
  })
})
