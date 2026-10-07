// home-attention.ts — pure attention selectors for the Home attention brief (Step 5, Track P).
// No I/O; "today" is always an injected WIB string (never Date.now() inside the selectors —
// FR-512). Reuses raciOwner (raci-member.ts) — the same ownership predicate the rest of the app
// already uses (Rule 11/NFR-504).

// No 'mentions' lane: Inbox (page + bell) is the one mentions surface (#745) — Home ranks tasks
// and failed checks only.
export type AttentionLaneKind = 'overdue' | 'due-today' | 'failed-checks'
export type LaneState = 'loading' | 'ready' | 'error'

/** The person-in-charge decoration on an attention row — the person's NAME (Luna J01/J02).
 *  Name only: the initials disc it used to pair with was retired (owner, 2026-07-28) and nothing
 *  renders initials any more, so carrying them here was a field computed for no reader. */
export interface AttentionPic { name: string }

export interface AttentionItem {
  id: string
  title: string
  meta?: string
  route: string
  /** Responsible person for a task row (decision context) — absent unless the directory is supplied. */
  pic?: AttentionPic
  /** Owning Team/BU caption for a task row — absent unless the directory is supplied. */
  caption?: string
}

/**
 * Optional display directory for enriching task attention rows with decision context (Luna J01/J02:
 * "what should I do next" must be answerable without clicking). Maps come from the SAME shared
 * directory (`getPeople` / `getBusinessUnits`) HomePage already loads for the personal canvas —
 * never a new read. Absent → rows render exactly as before (backward-compatible).
 */
export interface AttentionDirectory {
  /** personId → full name. */
  people?: ReadonlyMap<string, string>
  /** business_unit_id → name. */
  businessUnits?: ReadonlyMap<string, string>
}

export interface AttentionLane {
  kind: AttentionLaneKind
  state: LaneState
  items: AttentionItem[]
  /**
   * Re-fetch the ONE projection this lane's items come from (Home retry/projection
   * convergence). Overdue and due-today share the same underlying tasks fetch — both
   * lanes MUST be wired to the SAME function reference, never two independent fetches
   * of the same data, so a retry click is idempotent and never duplicates in-flight
   * work for one source (convergence-audit Home finding, 2026-07-21).
   */
  onRetry?: () => void
}

export { wibToday } from '@/lib/format/date'

/** Summed item count across lanes — the "Needs attention · N" header summary source (FR-509). */
export function attentionCount(lanes: { items: AttentionItem[] }[]): number {
  return lanes.reduce((sum, l) => sum + l.items.length, 0)
}
