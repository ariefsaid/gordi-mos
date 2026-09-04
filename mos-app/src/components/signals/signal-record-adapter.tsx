// wrapSignalRecord — projects the REAL Signal model (mos.signals / SignalDetail) into the shared
// RecordViewer grammar, in the JTBD-ordered anatomy of docs/specs/record-page-anatomy.spec.md §2.1
// (OD-REDESIGN-90; visual reference scratchpad ds-bundle/mockups/signal-record-anatomy.html). A
// Signal stays a Signal: it is NOT given a PIC, Supervisor, due date, Task status, or checklist
// ownership. A retracted Signal keeps its identity while the reach/discussion regions and every
// mutating action drop away; the tombstone/retract reason is the sole message.
//
// Per-kind composition (record-viewer.tsx keeps its shared region order untouched — a global flip
// would not make Task content-first, which composes its own content in TaskSurface, and would
// endanger every other consumer): a Signal packs its five job regions into ordered CONTENT slots.
//   identity(title) → [message, reach, discussion, facts, history]
//   1. message   — the full Signal body, unclipped, leading; attention pill + occurred ride with it.
//   2. reach     — mentions + visibility, the Acknowledge action, the roster, linked work + create/link.
//   3. discussion— the comment thread.
//   4. facts     — Reported by · Owning Team · Business Unit · Site · Category, quiet, near the end.
//   5. history   — "edited N times" disclosure (no raw old→new diff dumped in the default view).
import type { ReactNode } from 'react'
import type { SignalDetail } from '@/lib/db/signals'
import { SignalMessage } from './signal-record'
import type {
  RecordContentSlot,
  RecordViewerAdapter,
} from '@/components/records/record-viewer.types'
import type { Attention } from '@/lib/db/signals.types'

/** The record's identity name = the body's first line, UNTRUNCATED (OD-REDESIGN-90 / F2: the
 *  heading is never an ellipsized slice of the content — the full body always renders in the
 *  message region below, so the identity may safely be the first line whole). */
export function firstLine(body: string): string {
  return body.trim().split(/\r?\n/)[0] ?? ''
}

export interface WrapSignalRecordInput {
  detail: SignalDetail
  /** Formatted occurred time (host owns locale formatting) — rides with the message (LAW-2). */
  occurredLabel: string
  /** Region 2 node built by the host (needs handlers/state); null when retracted. */
  reach: ReactNode | null
  /** Optional author/deputy attention editor for the message region. */
  onAttentionChange?: (attention: Attention) => void
  onRepost?: () => void
  /** Region 3 node built by the host; null when retracted. */
  discussion: ReactNode | null
  /** Region 4 node (quiet provenance + category control) built by the host. */
  facts: ReactNode
  /** Region 5 node (edited disclosure) built by the host; null when never edited. */
  history: ReactNode | null
  /** DO-13/I18N-2 — the identity type-kicker text; the live host passes the locale-resolved
   *  `t('signals.record.title')`. Defaults to English so adapter unit tests keep their literal. */
  typeLabel?: string
}

/**
 * The LIVE Signal host wrapper (OD-REDESIGN-90 anatomy). Produces a RecordViewerAdapter whose
 * generic regions (metadata / relations / activity / actions) are EMPTY: the Signal's five job
 * regions are ordered CONTENT slots instead, so the content leads (F1), the identity title is the
 * unclipped first line (F2), provenance is one quiet region near the end with no per-field captions
 * (F3/LAW-6), the revision history is a single disclosed region with no raw diff dump (F4/LAW-5),
 * and every mutating action lives in the one reach register (F5/LAW-3).
 */
export function wrapSignalRecord(input: WrapSignalRecordInput): RecordViewerAdapter {
  const { detail, occurredLabel, reach, discussion, facts, history, typeLabel = 'Signal' } = input
  const signal = detail.signal
  const retracted = signal.retracted_at !== null
  const title = firstLine(signal.body)

  const message: RecordContentSlot = {
    id: 'message',
    label: 'Message',
    render: () => (
      <SignalMessage
        body={signal.body}
        attention={signal.attention}
        occurredLabel={occurredLabel}
        canEditAttention={!!input.onAttentionChange}
        onAttentionChange={input.onAttentionChange}
        retracted={retracted}
        retractReason={signal.retract_reason}
        onRepost={input.onRepost}
      />
    ),
  }

  const contentSlots: RecordContentSlot[] = [
    message,
    ...(!retracted && reach ? [{ id: 'reach', label: 'Reach & response', render: () => reach } as RecordContentSlot] : []),
    ...(!retracted && discussion ? [{ id: 'discussion', label: 'Discussion', render: () => discussion } as RecordContentSlot] : []),
    { id: 'facts', label: 'Facts', render: () => facts },
    ...(history ? [{ id: 'history', label: 'History', render: () => history } as RecordContentSlot] : []),
  ]

  return {
    kind: 'signal',
    id: signal.id,
    title,
    typeLabel,
    metadata: [],
    relations: [],
    contentSlots,
    activity: [],
    actions: [],
    // Retracted ⇒ read-only; the whole-record note stays unset (the message-region tombstone
    // already carries the reason — one provenance note, never duplicated, LAW-6).
    permission: { readOnly: retracted, allowedActionIds: [] },
    state: 'ready',
  }
}
