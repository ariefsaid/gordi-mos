/* eslint-disable react-refresh/only-export-components */
import './inbox.css'
import type { ReactNode } from 'react'
import type { To } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { can } from '@/lib/capabilities'
import { SignalRecordHost } from '@/components/signals/signal-record-host'
import { TaskSurface } from '@/components/tasks/task-surface'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import type { NotificationRow } from '@/lib/db/notifications'
import type {
  NotificationTargetRef,
  NotificationTargetType,
  ResolveTargetDeps,
  TargetRegistry,
} from './inbox-target'
import type { OverlayEntryDraft } from './inbox-host-contracts'
import type { OverlayOwner } from '@/shell/overlay-navigation'

/**
 * inbox-record-door — the Issue 7 seam that turns a resolved notification target into a real,
 * openable overlay entry.
 *
 * JQ-4 / interaction D-A4 (one shared RecordViewer for every open): opening a notification now
 * mounts the SAME canonical, actionable record host every other door uses — `SignalRecordHost`
 * for a signal, `TaskSurface` (chrome-free) for a task — inside the shared overlay host, so a
 * triager can act on the record IN the Inbox (acknowledge / comment / create-follow-up) instead of
 * reading a zero-action summary and having to hop to "Open full page" first. The host chrome (owned
 * by RecordPanelHost) still owns ✕ / Open-full-page (via the entry's `pageTo`) / Back, so the record
 * bodies stay chrome-free.
 *
 * `signal`'s CANONICAL_ROUTE/RECORD_CONTENT entries here point at the real `/work/signals/:id`
 * route and the ported `SignalRecordHost` — the Signals record surface landed as #193 (Stage 3),
 * the same PR that closed this door's placeholder. No further change is needed here.
 *
 * The producer `entity.route` is never used as authority — `CANONICAL_ROUTE` is the only route
 * source, keyed by the typed `{ type }`. `follow_up` is intentionally absent from the registry so
 * the resolver fails closed (feature-off) while `SHOW_FOLLOWUPS` is false.
 */

/** The ONLY canonical route authority, keyed by typed target type (never the producer route). */
const CANONICAL_ROUTE: Partial<Record<NotificationTargetType, (id: string) => To>> = {
  task: (id) => ({ pathname: `/work/tasks/${id}` }),
  signal: (id) => ({ pathname: `/work/signals/${id}` }),
}

/**
 * DEV-TASKSURFACE GAP (cite in review, ticket on map #150 before merge — OD-WAY-41): v4's
 * `TaskSurface` grew a `showPanelUtility` prop specifically so a host-embedded record renders
 * chrome-free (the host owns ✕ / Open-full-page / Back). That prop lands with Tasks' own port
 * (#192) — `dev`'s current `TaskSurface` has no such switch; at `width="drawer"` it ALWAYS renders
 * its own `TaskDrawerHeader`, own close button included. Suppressing that header entirely is
 * Tasks-surface work, out of #195's scope. The honest interim: wire that header's own close button
 * to the SAME overlay-host close the panel chrome uses, so both controls agree (never a dead
 * button, never two different closes) — a harmless doubled affordance, not a broken one. Delete
 * this wrapper once #192 lands.
 */
function InboxTaskRecordContent({ taskId }: { taskId: string }) {
  const host = useOptionalOverlayHost()
  return (
    <TaskSurface
      taskId={taskId}
      mode="view"
      width="drawer"
      onClose={() => { void host?.close('explicit-close') }}
    />
  )
}

/**
 * The shared, actionable record host mounted as the overlay entry's content, keyed by target type.
 * Both bodies self-fetch by id, so the Inbox reuses the exact record renderer the collections use —
 * never a bespoke summary (D-A4). See `InboxTaskRecordContent` above for the one interim exception
 * to "chrome-free" this port must accept until Tasks (#192) lands its own suppression switch.
 */
const RECORD_CONTENT: Partial<Record<NotificationTargetType, (id: string) => ReactNode>> = {
  signal: (id) => <SignalRecordHost signalId={id} mode="panel" />,
  task: (id) => <InboxTaskRecordContent taskId={id} />,
}

const TYPE_LABEL_KEY: Record<NotificationTargetType, MessageKey> = {
  task: 'inbox.target.type.task',
  signal: 'inbox.target.type.signal',
  follow_up: 'inbox.target.type.followUp',
}

/** Localized record-type label used as the host chrome title (a node so the host can render it). */
function RecordDoorTitle({ type }: { type: NotificationTargetType }) {
  const t = useT()
  return <>{t(TYPE_LABEL_KEY[type])}</>
}

/**
 * Per-target-type capability gates for the door. The VALUE is the `can()` capability a viewer must
 * hold to open that target's record from a notification; `undefined` means "no client gate — RLS is
 * the authority". None of the current openable types (task/signal) carry a client-open capability:
 * a notification is owner-scoped via RLS (the viewer only ever sees their own rows), and reading
 * one's own task/signal is RLS-permitted by construction. Should a future target type need a real
 * client gate (e.g. a finance-scoped notification), add it here and `canOpen` below will enforce it
 * automatically — no other change required.
 */
const TARGET_OPEN_CAPABILITY: Partial<Record<NotificationTargetType, string>> = {
  // task:   undefined — RLS gates the read (FR-333); the canonical Task page renders not-found for
  //                   archived/deleted targets, so the door does not need a separate existence check.
  // signal: undefined — same reasoning; Signal page handles its own not-found/archived state.
}

/**
 * Build the fail-closed resolver dependencies for one notification row. The registry is bound to the
 * row so the door content can render its arrival context. `task` and `signal` are wired to their
 * canonical routes; `follow_up` is deliberately omitted so the resolver returns `feature-off` while
 * the flag is dark.
 *
 * The three predicates are structured as follows (each is honest, not decorative):
 *  - `canOpen` consults the viewer's real `accessRoles` via `can()` for the target's open-capability
 *    (TARGET_OPEN_CAPABILITY). Currently no openable type carries one, so this returns true — but
 *    the wiring is real, so adding a gated type works without touching this function.
 *  - `isSameOrg` returns true because notifications are owner-private + org-scoped via RLS
 *    (notifications.ts §"Data layer": "RLS is the authority (owner-private, org-scoped)"). A
 *    cross-org notification is structurally invisible to this viewer — the row would never arrive.
 *  - `recordExists` returns true because the canonical Task/Signal page renders an honest
 *    `not-found-panel` (task-surface.tsx) / archived state for a deleted/archived target, so the
 *    door does not pretend the record is gone before the viewer sees the destination's own handling.
 */
export function buildInboxTargetDeps(
  row: NotificationRow,
  accessRoles: readonly string[] = [],
  owner: OverlayOwner = 'shell',
): ResolveTargetDeps {
  const registry: TargetRegistry = {}
  for (const type of ['task', 'signal'] as const) {
    const toRoute = CANONICAL_ROUTE[type]
    const toContent = RECORD_CONTENT[type]
    if (!toRoute || !toContent) continue
    registry[type] = {
      buildEntry(targetRef: NotificationTargetRef): OverlayEntryDraft {
        const pageTo = toRoute(targetRef.id)
        return {
          key: `${targetRef.type}:${targetRef.id}`,
          owner,
          tenant: 'record',
          label: row.title,
          title: <RecordDoorTitle type={targetRef.type} />,
          // pageTo routes the Open-full-page action through the host's leave-guarded openPage seam
          // (OverlayHostSlot reads active.entry.pageTo and renders the host-owned chrome button),
          // matching Task (task-collection-adapter.tsx:755) and Signal (signal-collection-adapter.tsx:330).
          pageTo,
          // JQ-4 / D-A4: the SAME actionable record host every other door mounts (never a summary).
          content: toContent(targetRef.id),
        }
      },
    }
  }
  return {
    registry,
    canOpen: (ref) => {
      const capability = TARGET_OPEN_CAPABILITY[ref.type]
      return capability == null ? true : can(accessRoles, capability)
    },
    isSameOrg: () => true, // RLS-attested: notifications are owner-private + org-scoped at the DB.
    recordExists: () => true, // Canonical page renders its own not-found/archived state.
    isFeatureEnabled: (type) => (type === 'follow_up' ? SHOW_FOLLOWUPS : true),
  }
}
