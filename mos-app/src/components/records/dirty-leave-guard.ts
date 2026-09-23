// dirtyLeaveGuard — the tenant-owned attach-only-while-dirty leave-guard factory (V3 Issue 5,
// plan Task 4/5; content-side half of the record-viewer.behavior.test.tsx contract).
//
// A record tenant (the Task panel, the Signal host) tracks its own unsaved-draft state via
// RecordViewer.onDirtyChange. It supplies an Issue 4 OverlayEntry.leaveGuard ONLY while a draft is
// dirty: a clean record returns `undefined` so the overlay host commits Close / Back / replace /
// open-page synchronously, and RecordField's own Escape cancels the field draft first without ever
// consulting this guard. While dirty, the guard defers to the tenant's confirmation (the shared
// ConfirmDialog/ModalShell) and maps Stay -> deny, Discard -> allow. The guard owns no history,
// focus, or confirmation copy — those stay with the host and the tenant respectively.
import type { OverlayLeaveGuard } from '@/shell/overlay-navigation'

/**
 * Build the leave-guard for a record's current dirty state.
 *
 * @param dirty          whether the record has an unsaved field draft
 * @param confirmDiscard tenant confirmation; resolves true to discard-and-leave, false to stay
 * @returns an async OverlayLeaveGuard while dirty, otherwise `undefined` (no guard = commit freely)
 */
export function dirtyLeaveGuard(
  dirty: boolean,
  confirmDiscard: () => Promise<boolean> | boolean,
): OverlayLeaveGuard | undefined {
  if (!dirty) return undefined
  return async () => ({ decision: (await confirmDiscard()) ? 'allow' : 'deny' })
}
