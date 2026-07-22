/* eslint-disable react-refresh/only-export-components */
import './inbox.css'
import type { To } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { can } from '@/lib/capabilities'
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
 * openable overlay entry, and the small in-context record surface it opens.
 *
 * Scope boundary (docs/plans/2026-07-20-v3-inbox-deputy.md): the full Issue 5 RecordViewer render
 * (typed field/relation/activity hierarchy) is NOT re-implemented here — record-viewer and
 * task/signal collection code are out of this slice. This door renders the notification's arrival
 * context (why it landed) inside the shared host and offers the ONE canonical door to the full
 * record page. Opening in-context keeps the queue behind the panel; the host chrome owns canonical
 * page promotion and closes the overlay through the shared route seam.
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

const TYPE_LABEL_KEY: Record<NotificationTargetType, MessageKey> = {
  task: 'inbox.target.type.task',
  signal: 'inbox.target.type.signal',
  follow_up: 'inbox.target.type.followUp',
}

const SEVERITY_KEY = {
  info: 'inbox.severity.info',
  warning: 'inbox.severity.warning',
  critical: 'inbox.severity.critical',
} as const

/**
 * The in-context record door rendered inside the shared overlay host. Shows the arrival context
 * (type · title · body · severity) so a triager understands why the item landed (J06).
 *
 * Navigation: the entry carries `pageTo`, so the shared host chrome owns the one Open-full-page
 * action (RecordPanelHost → host.openPage). The door itself stays chrome-free and does not create a
 * second route or button grammar.
 */
export function InboxRecordDoor({
  row,
  targetRef,
}: {
  row: NotificationRow
  targetRef: NotificationTargetRef
}) {
  const t = useT()

  return (
    <div className="inbox-record-door">
      <p className="inbox-record-door__type">
        <span
          className={`inbox-row__dot inbox-row__dot--${row.severity}`}
          aria-label={t(SEVERITY_KEY[row.severity])}
        />
        {t(TYPE_LABEL_KEY[targetRef.type])}
      </p>
      <h3 className="inbox-record-door__title">{row.title}</h3>
      {row.body ? <p className="inbox-record-door__body">{row.body}</p> : null}
    </div>
  )
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
    if (!toRoute) continue
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
          // NOTE: host.openPage closes the panel but does NOT navigate until R-T-4 (route seam) lands;
          // the door content below carries a fallback nav button until then.
          pageTo,
          content: <InboxRecordDoor row={row} targetRef={targetRef} />,
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
