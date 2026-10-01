// The leave-guard state of one create-task frame: whether a typed draft exists, and the guard that asks first.
import type { OverlayLeaveDecision, OverlayLeaveGuard, OverlayLeaveIntent } from '@/shell/overlay-navigation'

export type CatalogTaskCreateSession = {
  dirty: boolean
  /** Set by the mounted frame; asks the person whether to discard a typed draft. */
  requestConfirmation?: (intent: OverlayLeaveIntent) => Promise<OverlayLeaveDecision>
  guard: OverlayLeaveGuard
}

export function createCatalogTaskCreateSession(): CatalogTaskCreateSession {
  const session = {} as CatalogTaskCreateSession
  session.dirty = false
  session.guard = async (intent) => {
    if (!session.dirty) return { decision: 'allow' }
    return session.requestConfirmation?.(intent) ?? { decision: 'deny' }
  }
  return session
}
