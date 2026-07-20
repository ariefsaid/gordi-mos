// leave-guard.ts — a MINIMAL, forward-declared mirror of the Issue 4 overlay
// leave-guard contract (docs/plans/2026-07-20-v3-overlay-host.md, revision ab3160a4).
//
// WHY THIS EXISTS: Issue 4 (the OverlayHost, RecordRouteAdapter, and the physical
// RecordPanelHost) is being built in parallel on another branch and is NOT yet present
// on this checkout. Issue 5 must not recreate that host. But the RecordViewer dirty
// flow (RecordField → onDirtyChange → the containing Task/Signal tenant) needs a stable,
// typed name for the async guard the tenant will attach to OverlayEntry.leaveGuard.
//
// INTEGRATION POINT (Task 6, deferred until Issue 4 lands): delete this file and import
// `OverlayLeaveGuard` / `OverlayLeaveIntent` / `OverlayLeaveDecision` from
// `@/shell/overlay-navigation`. The shapes below are kept intentionally identical to the
// committed Issue 4 contract so that swap is a pure import change, not a behavior change.
//
// This module builds NO host, history, focus, or confirmation primitive — those are
// Issue 4's. It is types only.

/** Where an overlay leave-intent originates. Mirrors Issue 4 OverlayEntrySummary. */
export interface OverlayEntrySummary {
  key: string
  owner: 'shell' | 'tasks' | 'signals'
}

/**
 * The domain-neutral leave intents the host raises. RecordField Escape is NOT here —
 * a field draft is cancelled first, in isolation, and never reaches this guard
 * (NFR-V3-001). Only whole-record leave transitions do.
 */
export type OverlayLeaveIntent =
  | { kind: 'close'; via: 'explicit-close' | 'escape'; from: OverlayEntrySummary }
  | { kind: 'back'; via: 'internal-back'; from: OverlayEntrySummary; depth: number }
  | { kind: 'replace'; via: 'push' | 'replace-root' | 'replace-current'; from: OverlayEntrySummary; to: OverlayEntrySummary }
  | { kind: 'open-page'; via: 'open-page'; from: OverlayEntrySummary }
  | { kind: 'browser-pop'; direction: 'back' | 'forward'; delta: number }

export type OverlayLeaveDecision = { decision: 'allow' } | { decision: 'deny' }

/**
 * The async guard a tenant attaches while a record has a dirty draft. It receives the
 * neutral intent, opens the TENANT-owned ConfirmDialog/ModalShell, and resolves
 * allow/deny. A missing guard (clean record) commits immediately. The generic host
 * never reads a dirty boolean nor supplies confirmation copy.
 */
export type OverlayLeaveGuard = (intent: OverlayLeaveIntent) => Promise<OverlayLeaveDecision>
