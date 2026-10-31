// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
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

// The hard-load capture happens once at module load, so each case boots a fresh copy of the
// module against a stubbed navigation-timing entry and URL.
async function bootedPageMode(navType: string | null, pathname: string, taskId: string): Promise<boolean> {
  vi.resetModules()
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(navType ? ([{ type: navType }] as never) : [])
  window.history.replaceState({}, '', pathname)
  const mod = await import('./task-page-mode')
  return mod.isTaskPageMode({ taskId, isNew: false, state: undefined, navigationType: 'POP' })
}

describe('hard-load detection (module boot)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it.each(['navigate', 'reload', 'back_forward'])('a hard %s onto the record opens it as a page', async (type) => {
    expect(await bootedPageMode(type, '/work/tasks/t1', 't1')).toBe(true)
  })

  it('a hard load onto a different record leaves this one in the panel', async () => {
    expect(await bootedPageMode('navigate', '/work/tasks/t1', 't2')).toBe(false)
  })

  it('rejects unsupported navigation timing types', async () => {
    expect(await bootedPageMode('prerender', '/work/tasks/t1', 't1')).toBe(false)
  })

  it('rejects the create route and collection route', async () => {
    expect(await bootedPageMode('navigate', '/work/tasks/new', 'new')).toBe(false)
    expect(await bootedPageMode('navigate', '/work/tasks', 't1')).toBe(false)
  })

  it('rejects a missing navigation timing entry', async () => {
    expect(await bootedPageMode(null, '/work/tasks/t1', 't1')).toBe(false)
  })
})
