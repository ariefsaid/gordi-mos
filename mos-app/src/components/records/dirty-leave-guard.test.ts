import { describe, it, expect, vi } from 'vitest'
import { dirtyLeaveGuard } from './dirty-leave-guard'
import type { OverlayLeaveIntent } from '@/shell/overlay-navigation'

const intent: OverlayLeaveIntent = {
  kind: 'close',
  via: 'explicit-close',
  from: { key: 'task-1', owner: 'tasks' },
}

describe('dirtyLeaveGuard (tenant-owned, attach-only-while-dirty)', () => {
  it('DirtyBoundaryContract: a clean record supplies NO guard so the host commits leave freely', () => {
    const confirmDiscard = vi.fn()
    expect(dirtyLeaveGuard(false, confirmDiscard)).toBeUndefined()
    expect(confirmDiscard).not.toHaveBeenCalled()
  })

  it('DirtyLeaveGuardContract: a dirty record supplies a guard; Discard resolves allow', async () => {
    const guard = dirtyLeaveGuard(true, () => true)
    expect(guard).toBeTypeOf('function')
    await expect(guard!(intent)).resolves.toEqual({ decision: 'allow' })
  })

  it('DirtyLeaveGuardContract: Stay resolves deny — the draft, URL, and focus stay put', async () => {
    const guard = dirtyLeaveGuard(true, () => false)
    await expect(guard!(intent)).resolves.toEqual({ decision: 'deny' })
  })

  it('awaits an async tenant confirmation before deciding', async () => {
    const confirmDiscard = vi.fn(async () => true)
    const guard = dirtyLeaveGuard(true, confirmDiscard)
    await expect(guard!(intent)).resolves.toEqual({ decision: 'allow' })
    expect(confirmDiscard).toHaveBeenCalledTimes(1)
  })
})
