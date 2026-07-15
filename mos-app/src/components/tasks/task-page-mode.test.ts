import { describe, it, expect } from 'vitest'
import { isTaskPageMode, readBootRecordId } from './task-page-mode'

describe('isTaskPageMode — OD-63 panel vs page detection', () => {
  it('in-list click (no state, not a boot direct load) → panel mode (false)', () => {
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: undefined }, null)).toBe(false)
    // boot landed on a DIFFERENT record → still panel for this one (in-app nav)
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: undefined }, 't-other')).toBe(false)
  })

  it('direct/new-tab/refresh onto the record (boot direct load) → page mode (true)', () => {
    expect(isTaskPageMode({ taskId: 't1', isNew: false, state: undefined }, 't1')).toBe(true)
  })

  it('direct record → list → same-record SPA click stays panel even when boot id matches', () => {
    expect(
      isTaskPageMode(
        { taskId: 't1', isNew: false, state: { taskSurface: 'panel' }, navigationType: 'PUSH' },
        't1',
      ),
    ).toBe(false)
  })

  it('a real refresh is page mode even if the prior panel state survives browser history', () => {
    expect(
      isTaskPageMode(
        { taskId: 't1', isNew: false, state: { taskSurface: 'panel' }, navigationType: 'POP' },
        't1',
      ),
    ).toBe(true)
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

  it('an in-app replace navigation without panel state cannot escalate from a stale boot id', () => {
    expect(
      isTaskPageMode({ taskId: 't1', isNew: false, state: undefined, navigationType: 'REPLACE' }, 't1'),
    ).toBe(false)
  })

  it('the create route (/work/tasks/new) is never a standalone page', () => {
    expect(isTaskPageMode({ taskId: undefined, isNew: true, state: undefined }, 'new')).toBe(false)
  })

  it('no task id (the bare collection) is never a standalone page', () => {
    expect(isTaskPageMode({ taskId: null, isNew: false, state: undefined }, null)).toBe(false)
    expect(isTaskPageMode({ taskId: undefined, isNew: false, state: { taskSurface: 'page' } }, null)).toBe(false)
  })
})

describe('readBootRecordId — deterministic navigation timing seam', () => {
  it.each([
    ['navigate', '/work/tasks/t1', 't1'],
    ['reload', '/work/tasks/t2', 't2'],
    ['back_forward', '/work/tasks/t3', 't3'],
  ] as const)('accepts a hard navigation type (%s)', (type, pathname, id) => {
    expect(readBootRecordId({ type }, pathname)).toBe(id)
  })

  it('rejects unsupported navigation timing types', () => {
    expect(readBootRecordId({ type: 'prerender' }, '/work/tasks/t1')).toBeNull()
  })

  it('rejects the create route and collection route', () => {
    expect(readBootRecordId({ type: 'navigate' }, '/work/tasks/new')).toBeNull()
    expect(readBootRecordId({ type: 'navigate' }, '/work/tasks')).toBeNull()
  })

  it('rejects missing navigation timing and missing pathname', () => {
    expect(readBootRecordId(undefined, '/work/tasks/t1')).toBeNull()
    expect(readBootRecordId({ type: 'navigate' }, null)).toBeNull()
  })
})
