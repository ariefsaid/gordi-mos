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
})
