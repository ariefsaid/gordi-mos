import { describe, it, expect } from 'vitest'
import { isTaskPageMode } from './task-page-mode'

describe('isTaskPageMode — OD-63 panel vs page detection', () => {
  it('in-list click (no state, not a boot direct load) → panel mode (false)', () => {
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: undefined }, null)).toBe(false)
    // boot landed on a DIFFERENT record → still panel for this one (in-app nav)
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: undefined }, 't-other')).toBe(false)
  })

  it('direct/new-tab/refresh onto the record (boot direct load) → page mode (true)', () => {
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: undefined }, 't1')).toBe(true)
  })

  it('explicit "Open full page" escalation (state.taskSurface==="page") → page mode even from an in-app nav', () => {
    expect(
      isTaskPageMode({ taskId: 't1', isNew: false, state: { taskSurface: 'page' } }, null),
    ).toBe(true)
  })

  it('a stale/other state value does NOT trigger page mode', () => {
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: { taskSurface: 'panel' } }, null)).toBe(false)
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: { foo: 'bar' } }, null)).toBe(false)
  })

  it('the create route (/work/tasks/new) is never a standalone page', () => {
    expect(isTaskPageMode({ taskId: undefined, isNew: true, state: undefined }, 'new')).toBe(false)
  })

  it('no task id (the bare collection) is never a standalone page', () => {
    expect(isTaskPageMode({ taskId: null, isNew: false, state: undefined }, null)).toBe(false)
    expect(isTaskPageMode({ taskId: undefined, isNew: false, state: { taskSurface: 'page' } }, null)).toBe(false)
  })
})
