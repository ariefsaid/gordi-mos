import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useToast } from './use-toast'

afterEach(() => vi.useRealTimers())

describe('useToast', () => {
  it('hides the toast after its duration', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('Saved', 1000))
    expect(result.current.toast?.message).toBe('Saved')
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.toast).toBeNull()
  })

  it('cancels a pending hide when the page unmounts', () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useToast())
    act(() => result.current.showToast('Saved', 1000))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
