import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferredCommit, UNDO_WINDOW_MS } from './deferred-commit'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function setup(delayMs?: number) {
  const commit = vi.fn(async () => {})
  const changes: (readonly string[])[] = []
  const d = createDeferredCommit<string>({ delayMs, commit, onChange: (p) => changes.push(p) })
  return { d, commit, changes }
}

describe('deferred commit (Undo without a database change)', () => {
  it('shows the item as pending at once and writes nothing until the window ends', async () => {
    const { d, commit, changes } = setup()
    d.start(['a'])
    expect(d.pending).toEqual(['a'])
    expect(changes.at(-1)).toEqual(['a'])
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(['a'])
    expect(d.pending).toEqual([])
  })

  it('defaults to a six second window', () => {
    expect(UNDO_WINDOW_MS).toBe(6000)
  })

  it('Undo cancels the write: nothing is ever committed', async () => {
    const { d, commit } = setup()
    d.start(['a', 'b'])
    expect(d.undo()).toEqual(['a', 'b'])
    expect(d.pending).toEqual([])
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 3)
    expect(commit).not.toHaveBeenCalled()
  })

  it('flush (leaving the page) writes at once and the timer does not write again', async () => {
    const { d, commit } = setup()
    d.start(['a'])
    await d.flush()
    expect(commit).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('flush with nothing pending writes nothing', async () => {
    const { d, commit } = setup()
    await d.flush()
    expect(commit).not.toHaveBeenCalled()
  })

  it('a second action writes the first at once; Undo then only reverses the second', async () => {
    const { d, commit } = setup()
    d.start(['a'])
    await vi.advanceTimersByTimeAsync(2000)
    d.start(['b'])
    expect(commit).toHaveBeenCalledWith(['a'])
    expect(d.pending).toEqual(['b'])
    expect(d.undo()).toEqual(['b'])
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('a bulk group is one undo and one write', async () => {
    const { d, commit } = setup()
    d.start(['a', 'b', 'c'])
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  it('ignores an empty group', () => {
    const { d, changes } = setup()
    d.start([])
    expect(changes).toEqual([])
  })
})
