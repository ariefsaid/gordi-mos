import { describe, expect, it } from 'vitest'
import { isOpenTask } from './task-open'

describe('isOpenTask — the one open-task definition (#1030)', () => {
  it('is open unless Done or archived', () => {
    expect(isOpenTask({ status: 'Open' })).toBe(true)
    expect(isOpenTask({ status: 'In Progress', archived_at: null })).toBe(true)
    expect(isOpenTask({ status: 'Blocked' })).toBe(true)
    expect(isOpenTask({ status: 'Done' })).toBe(false)
    expect(isOpenTask({ status: 'Open', archived_at: '2026-01-01T00:00:00Z' })).toBe(false)
  })
})
