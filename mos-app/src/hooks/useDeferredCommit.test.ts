import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDeferredCommit } from './useDeferredCommit'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useDeferredCommit', () => {
  it('exposes the pending ids, then writes once after the window', async () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDeferredCommit<string>(commit, 6000))
    act(() => result.current.start(['a']))
    expect(result.current.pending).toEqual(['a'])
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(commit).toHaveBeenCalledWith(['a'])
    expect(result.current.pending).toEqual([])
  })

  it('Undo clears pending and never writes', async () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDeferredCommit<string>(commit, 6000))
    act(() => result.current.start(['a']))
    act(() => { result.current.undo() })
    expect(result.current.pending).toEqual([])
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(commit).not.toHaveBeenCalled()
  })

  it('leaving the page (unmount) writes at once', () => {
    const commit = vi.fn()
    const { result, unmount } = renderHook(() => useDeferredCommit<string>(commit, 6000))
    act(() => result.current.start(['a', 'b']))
    unmount()
    expect(commit).toHaveBeenCalledWith(['a', 'b'])
  })

  it('hiding the tab writes at once', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => useDeferredCommit<string>(commit, 6000))
    act(() => result.current.start(['a']))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(commit).toHaveBeenCalledWith(['a'])
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })
})
