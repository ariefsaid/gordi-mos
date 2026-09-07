import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalAttentionPicker } from './signal-attention-picker'

// Wiring test for the round-5 inline rework (#768): the menu is NOT portaled — it renders inside
// the picker wrapper (so it lands inside the composer dialog's focus trap and the record panel's
// stacking), and the flip decision reads the TRIGGER and MENU rects after mount (no `?? 220`
// width literal, no fixed positioning). jsdom reports zero rects, so the geometry is stubbed at
// the prototype with the live 390 measurements: pill bottom 754.8, menu 171 tall.
function stubRects(pill: { top: number; bottom: number }, menu: { height: number }) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 220, height: 0, toJSON: () => ({}) }
    if (this.classList.contains('signal-attention-pill')) Object.assign(rect, { top: pill.top, bottom: pill.bottom })
    if (this.classList.contains('signal-attention-popover')) Object.assign(rect, { height: menu.height })
    return rect as DOMRect
  })
}

function renderPicker() {
  return render(
    <I18nProvider>
      <SignalAttentionPicker value="FYI" onChange={() => {}} />
    </I18nProvider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

describe('SignalAttentionPicker — inline menu placement (#768 round 5)', () => {
  it('renders the menu INLINE (inside the picker wrapper), not portaled to document.body', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /FYI/i }))
    const menu = screen.getByRole('menu')
    // In the composer this wrapper sits inside the modal surface, so the modal's Tab trap sees
    // the menuitems; a document.body portal would put them outside it (round-4 defect).
    expect(menu.closest('.signal-attention-picker')).not.toBeNull()
    expect(menu.parentElement).toHaveClass('signal-attention-picker')
  })

  it('flips above the trigger when the downward menu would cross the viewport bottom (390 case)', async () => {
    stubRects({ top: 710.8, bottom: 754.8 }, { height: 171 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /FYI/i }))
    expect(screen.getByRole('menu')).toHaveClass('signal-attention-popover--flip-up')
  })

  it('stays below the trigger when the downward menu fits (desktop case)', async () => {
    stubRects({ top: 476.8, bottom: 520.8 }, { height: 171 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /FYI/i }))
    const menu = screen.getByRole('menu')
    expect(menu).not.toHaveClass('signal-attention-popover--flip-up')
  })
})
