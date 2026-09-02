import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import { SignalCategoryPicker } from './signal-category-picker'

function renderPicker(props: Partial<React.ComponentProps<typeof SignalCategoryPicker>> = {}) {
  return render(
    <I18nProvider>
      <SignalCategoryPicker category={null} {...props} />
    </I18nProvider>,
  )
}

describe('SignalCategoryPicker', () => {
  it('renders "Add category" for an uncategorised Signal and opens the 8-family listbox', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))

    const listbox = screen.getByRole('listbox', { name: /categor/i })
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(8)
    expect(within(listbox).getByRole('option', { name: 'Supply/vendor' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'Other' })).toBeInTheDocument()
  })

  it('calls onCategorize with the chosen family and closes the listbox', async () => {
    const onCategorize = vi.fn()
    renderPicker({ onCategorize })
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Quality' }))

    expect(onCategorize).toHaveBeenCalledWith('Quality')
    expect(screen.queryByRole('listbox', { name: /categor/i })).not.toBeInTheDocument()
  })

  it('renders the category pill (no "Add category") once a category is set', () => {
    renderPicker({ category: 'Equipment/facility' })
    expect(screen.getByText('Equipment/facility')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add category/i })).not.toBeInTheDocument()
  })

  // #577: on a right-column feed row the anchor sits close to the viewport's right edge; the
  // popover's `left: 0` CSS default then pushed it (min-width 200px) past the window edge,
  // hard-clipping options mid-word. Stub a narrow viewport + a near-edge anchor rect and assert
  // the computed inline `left` shifts the popover fully back on-screen.
  it('clamps the popover left offset inside a narrow viewport when the anchor sits near the right edge', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const base = { top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
      if (this.classList.contains('signal-category-picker-anchor')) {
        return { ...base, left: 380, right: 380, width: 0 } as DOMRect
      }
      if (this.classList.contains('signal-category-picker')) {
        return { ...base, left: 380, right: 580, width: 200 } as DOMRect
      }
      return { ...base, left: 0, right: 0, width: 0 } as DOMRect
    })

    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    const listbox = screen.getByRole('listbox', { name: /categor/i })

    // anchorLeft 380, popoverWidth 200, viewportWidth 400, margin 8 -> maxLeft 192 -> offset -188.
    expect(listbox.style.left).toBe('-188px')
    const resultingLeft = 380 - 188
    expect(resultingLeft).toBeGreaterThanOrEqual(8)
    expect(resultingLeft + 200).toBeLessThanOrEqual(400 - 8)

    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
  })

  // #631: reposition() must measure the popover's natural width, not whatever width a PRIOR
  // reposition already constrained it to — otherwise a shrink at a narrow viewport never
  // recovers once the viewport widens back out (a ratchet). Model real DOM behavior: the node's
  // measured width is capped by its own inline `max-width` if one happens to be set, exactly as
  // a browser would render it — so the fix has to actively reset that style before measuring,
  // not just avoid setting one of its own.
  it('recovers the popover width after a widen, even if the node is carrying a stale inline max-width', async () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 220, configurable: true })
    const NATURAL_WIDTH = 300

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const base = { top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
      if (this.classList.contains('signal-category-picker-anchor')) {
        return { ...base, left: 450, right: 450, width: 0 } as DOMRect
      }
      if (this.classList.contains('signal-category-picker')) {
        const stale = parseFloat(this.style.maxWidth)
        const width = Number.isFinite(stale) ? Math.min(NATURAL_WIDTH, stale) : NATURAL_WIDTH
        return { ...base, left: 450, right: 450 + width, width } as DOMRect
      }
      return { ...base, left: 0, right: 0, width: 0 } as DOMRect
    })

    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: /add category/i }))
    const listbox = screen.getByRole('listbox', { name: /categor/i })

    // Simulate a prior reposition (at an even narrower viewport, or from any future caller that
    // mirrors this pattern) having left the node constrained well below its natural width.
    listbox.style.maxWidth = '120px'

    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true })
    window.dispatchEvent(new Event('resize'))

    // anchorLeft 450, viewport 500, margin 8: with the TRUE natural width (300) the clamp puts
    // the popover's left edge at 192 (maxLeft = 500 - 300 - 8), i.e. offset 192 - 450 = -258. A
    // reposition that trusted the stale 120px reading would instead compute offset -78 (maxLeft
    // = 500 - 120 - 8 = 372, offset 372 - 450) and leave the popover 180px further right than it
    // needs to be, off the widened viewport at its true (unclamped-by-CSS) rendered width.
    await waitFor(() => expect(listbox.style.left).toBe('-258px'))

    rectSpy.mockRestore()
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true })
  })
})
