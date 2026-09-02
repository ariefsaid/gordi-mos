import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePopoverReflow } from './use-popover-reflow'

describe('usePopoverReflow', () => {
  it('calls onReflow on window scroll and resize while active', () => {
    const onReflow = vi.fn()
    renderHook(() => usePopoverReflow(true, onReflow))

    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))

    expect(onReflow).toHaveBeenCalledTimes(2)
  })

  it('does not listen when inactive', () => {
    const onReflow = vi.fn()
    renderHook(() => usePopoverReflow(false, onReflow))

    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))

    expect(onReflow).not.toHaveBeenCalled()
  })

  it('stops listening once it goes inactive again', () => {
    const onReflow = vi.fn()
    const { rerender } = renderHook(({ active }) => usePopoverReflow(active, onReflow), {
      initialProps: { active: true },
    })

    rerender({ active: false })
    window.dispatchEvent(new Event('scroll'))

    expect(onReflow).not.toHaveBeenCalled()
  })

  it('fires on a capture-phase scroll dispatched on an ancestor element, not just window', () => {
    // Scroll events don't bubble, so a non-capturing window listener never sees one dispatched on
    // a descendant — only a capture-phase listener does, since capture travels window -> target.
    const onReflow = vi.fn()
    const el = document.createElement('div')
    document.body.appendChild(el)

    renderHook(() => usePopoverReflow(true, onReflow))
    el.dispatchEvent(new Event('scroll', { bubbles: false }))

    expect(onReflow).toHaveBeenCalledTimes(1)
    document.body.removeChild(el)
  })

  it('stops listening after unmount', () => {
    const onReflow = vi.fn()
    const { unmount } = renderHook(() => usePopoverReflow(true, onReflow))

    unmount()
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))

    expect(onReflow).not.toHaveBeenCalled()
  })
})
