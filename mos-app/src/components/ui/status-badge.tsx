/* eslint-disable react-refresh/only-export-components */
// StatusBadge — the ONE map from a status to its colour and word, used by every area (Tasks, Home,
// Signals, Inbox, People, Café items, Objectives, Pending bills). A status never carries a second
// look: Active is green everywhere, Urgent is red everywhere, Needs attention is amber everywhere.
// Words follow CONTEXT.md (Needs attention, never "warning"). Shell: the shared Pill (dot + word).
import { Pill, type PillTone } from './pill'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'

export type StatusKey =
  | 'open' | 'inProgress' | 'blocked' | 'done'
  | 'active' | 'archived' | 'disabled'
  | 'urgent' | 'needsAttention' | 'fyi'
  | 'posted' | 'pending' | 'inFlight' | 'failed' | 'deadLetter' | 'held'
  | 'billOpen' | 'billPartial' | 'billSettled' | 'billOverpaid' | 'billVoid' | 'billMissing'

export const STATUS_MAP: Record<StatusKey, { tone: PillTone; label: MessageKey }> = {
  open: { tone: 'neutral', label: 'tasks.status.open' },
  inProgress: { tone: 'primary', label: 'tasks.status.inProgress' },
  blocked: { tone: 'warning', label: 'tasks.status.blocked' },
  done: { tone: 'success', label: 'tasks.status.done' },
  active: { tone: 'success', label: 'catalog.view.active' },
  archived: { tone: 'neutral', label: 'catalog.view.archived' },
  disabled: { tone: 'neutral', label: 'admin.people.login.disabled' },
  urgent: { tone: 'destructive', label: 'signals.archive.attentionUrgent' },
  needsAttention: { tone: 'warning', label: 'home.stream.reason.needsAttention' },
  fyi: { tone: 'neutral', label: 'signals.archive.attentionFyi' },
  // Café sent-to-ESB pushes.
  posted: { tone: 'success', label: 'kitchen.pushes.status.posted' },
  pending: { tone: 'neutral', label: 'kitchen.pushes.status.pending' },
  inFlight: { tone: 'primary', label: 'kitchen.pushes.status.inFlight' },
  failed: { tone: 'warning', label: 'kitchen.pushes.status.failed' },
  deadLetter: { tone: 'destructive', label: 'kitchen.pushes.status.deadLetter' },
  held: { tone: 'neutral', label: 'kitchen.pushes.status.held' },
  // Money pending bills (copied from ESB): paid in full is green; part-paid, overpaid and bills ESB
  // no longer carries are the amber exceptions; a voided bill is a closed record.
  billOpen: { tone: 'neutral', label: 'pendingBills.state.open' },
  billPartial: { tone: 'warning', label: 'pendingBills.state.partial' },
  billSettled: { tone: 'success', label: 'pendingBills.state.settled' },
  billOverpaid: { tone: 'warning', label: 'pendingBills.state.overpaid' },
  billVoid: { tone: 'warning', label: 'pendingBills.state.void' },
  billMissing: { tone: 'warning', label: 'pendingBills.state.missing' },
}

/** Task lifecycle word → shared status key. */
export const TASK_STATUS_KEY = { Open: 'open', 'In Progress': 'inProgress', Blocked: 'blocked', Done: 'done' } as const satisfies Record<string, StatusKey>

export function StatusBadge({ status, label, className }: { status: StatusKey; label?: string; className?: string }) {
  const t = useT()
  const entry = STATUS_MAP[status]
  // NO aria-label: the visible word is the accessible name (status pickers render this inside a role=option).
  return <Pill tone={entry.tone} className={`status-badge${className ? ` ${className}` : ''}`}>{label ?? t(entry.label)}</Pill>
}

/** Signal attention level → shared status key (Urgent · Needs attention · FYI). */
export const ATTENTION_STATUS_KEY = { 'Urgent': 'urgent', 'Needs attention': 'needsAttention', 'FYI': 'fyi' } as const satisfies Record<string, StatusKey>
