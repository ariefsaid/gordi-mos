import { describe, it, expect } from 'vitest'
import { readBootSignalRecordId } from './signal-page-mode'

// Mirror of task-page-mode's hard-load detection (OD-63 / Rule 4): a DIRECT hard load onto
// /work/signals?record=<id> escalates to the canonical page; an in-app SPA nav (no boot timing
// entry) stays in the drawer.

const NAV = { type: 'navigate' } as PerformanceNavigationTiming
const RELOAD = { type: 'reload' } as PerformanceNavigationTiming
const POP = { type: 'back_forward' } as PerformanceNavigationTiming

describe('readBootSignalRecordId — hard-load escalation for the Signal record', () => {
  it('no boot navigation entry (jsdom / in-app SPA nav) → null (stays in the drawer)', () => {
    expect(readBootSignalRecordId(undefined, '/mos/work/signals', '?record=sig-1')).toBeNull()
  })

  it('hard navigate onto /work/signals?record=<id> → the id (escalate to canonical page)', () => {
    expect(readBootSignalRecordId(NAV, '/mos/work/signals', '?record=sig-1')).toBe('sig-1')
  })

  it('refresh (reload) onto ?record=<id> → the id', () => {
    expect(readBootSignalRecordId(RELOAD, '/work/signals', '?record=sig-9')).toBe('sig-9')
  })

  it('back_forward into ?record=<id> → the id', () => {
    expect(readBootSignalRecordId(POP, '/work/signals', '?record=sig-2')).toBe('sig-2')
  })

  it('no ?record= param → null (a plain archive hard-load stays on the list)', () => {
    expect(readBootSignalRecordId(NAV, '/work/signals', '?q=freezer')).toBeNull()
  })

  it('a non-archive path (canonical page route) → null (that route is already a page)', () => {
    expect(readBootSignalRecordId(NAV, '/work/signals/sig-1', '')).toBeNull()
  })

  it('a non-hard navigation type → null', () => {
    expect(readBootSignalRecordId({ type: 'prerender' } as PerformanceNavigationTiming, '/work/signals', '?record=sig-1')).toBeNull()
  })
})
