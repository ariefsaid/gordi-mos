// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { appUrl } from '@/config/app-build-settings'

// Mirror of task-page-mode's hard-load detection (OD-63 / Rule 4): a DIRECT hard load onto
// /work/signals?record=<id> escalates to the canonical page; an in-app SPA nav (no boot timing
// entry) stays in the drawer. The capture happens once at module load, so each case boots a fresh
// copy of the module against a stubbed navigation-timing entry and URL.
async function bootSignalId(navType: string | null, pathname: string, search: string): Promise<string | null> {
  vi.resetModules()
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(navType ? ([{ type: navType }] as never) : [])
  window.history.replaceState({}, '', pathname + search)
  const mod = await import('./signal-page-mode')
  return mod.BOOT_SIGNAL_RECORD_ID
}

describe('BOOT_SIGNAL_RECORD_ID — hard-load escalation for the Signal record', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('no boot navigation entry (jsdom / in-app SPA nav) → null (stays in the drawer)', async () => {
    expect(await bootSignalId(null, appUrl('/work/signals'), '?record=sig-1')).toBeNull()
  })

  it('hard navigate onto /work/signals?record=<id> → the id (escalate to canonical page)', async () => {
    expect(await bootSignalId('navigate', appUrl('/work/signals'), '?record=sig-1')).toBe('sig-1')
  })

  it('refresh (reload) onto ?record=<id> → the id', async () => {
    expect(await bootSignalId('reload', '/work/signals', '?record=sig-9')).toBe('sig-9')
  })

  it('back_forward into ?record=<id> → the id', async () => {
    expect(await bootSignalId('back_forward', '/work/signals', '?record=sig-2')).toBe('sig-2')
  })

  it('no ?record= param → null (a plain archive hard-load stays on the list)', async () => {
    expect(await bootSignalId('navigate', '/work/signals', '?q=freezer')).toBeNull()
  })

  it('a non-archive path (canonical page route) → null (that route is already a page)', async () => {
    expect(await bootSignalId('navigate', '/work/signals/sig-1', '')).toBeNull()
  })

  it('a non-hard navigation type → null', async () => {
    expect(await bootSignalId('prerender', '/work/signals', '?record=sig-1')).toBeNull()
  })
})
