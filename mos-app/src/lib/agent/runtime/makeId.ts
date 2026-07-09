/**
 * makeId — the ONE client-side id generator shared by mosNativeRuntime.ts (run ids) and
 * useAssistantPanel.ts (optimistic transcript-item ids). CQ#4: previously duplicated in both
 * files; extracted here so there is a single implementation to maintain.
 *
 * (handler.ts's copy — the Deno edge function — stays separate: Deno/Node module boundary, no
 * shared module across that seam.)
 */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}
