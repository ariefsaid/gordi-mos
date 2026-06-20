// OpsPage — Daily Log (P2-3b, FR-030..037/039, AC-060..067)
// Design authority: docs/plans/2026-06-12-ops-log-design.md + DESIGN.md tokens.
// Data: listLogEntries (ops schema, RLS-scoped), getBusinessUnits (directory),
//       getTaskTitlesByIds (client-side linked-task resolution, NFR-006).

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { Chevron } from '@/shell/icons'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { listLogEntries, archiveLogEntry, unarchiveLogEntry } from '@/lib/db/ops-log'
import type { LogFilters } from '@/lib/db/ops-log'
import type { LogEntryRow, LogEventType } from '@/lib/db/ops-log.types'
import { getBusinessUnits } from '@/lib/db/directory'
import type { BusinessUnitOption } from '@/lib/db/directory'
import { getTaskTitlesByIds } from '@/lib/db/tasks'
import type { TaskTitleRef } from '@/lib/db/tasks'
import { StatusPill } from '@/components/tasks/status-pill'
import { Pill } from '@/components/ui/pill'
import { ErrorState, EmptyState } from '@/components/ui/state-kit'
import type { TaskStatus } from '@/lib/db/tasks.types'
import { weekLabel } from '@/lib/week'

// ── WIB time formatter ───────────────────────────────────────────────────────
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
function toWibTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// ── event_type → display label (EN chrome, CONTEXT.md: "event" banned) ───────
const EVENT_TYPE_LABELS: Record<LogEventType, string> = {
  production: 'Production',
  receiving: 'Receiving',
  qc: 'QC',
  follow_up: 'Follow-up',
  other: 'Other',
}

// ── Source badge variant lookup (§3.1 design-plan) ───────────────────────────
// Determined by BU name pattern (case-insensitive slug match). Falls back to neutral.
function sourceBadgeVariant(buName: string): 'kitchen' | 'roastery' | 'neutral' {
  const n = buName.toLowerCase()
  if (n.includes('kitchen') || n.includes('bar')) return 'kitchen'
  if (n.includes('roastery')) return 'roastery'
  return 'neutral'
}

// ── OpsSourceBadge ────────────────────────────────────────────────────────────
interface OpsSourceBadgeProps { name: string }
// VIS-4 (PR-2): re-skinned onto the shared <Pill>. kitchen→primary, roastery→violet,
// neutral→neutral (dotless). The wrapper span carries the test hook + accessible name
// (Pill's typed props are aria-only; data-testid rides on the wrapper).
function OpsSourceBadge({ name }: OpsSourceBadgeProps) {
  const variant = sourceBadgeVariant(name)
  const tone = variant === 'kitchen' ? 'primary' : variant === 'roastery' ? 'violet' : 'neutral'
  return (
    <span data-testid="ops-source-badge" aria-label={`Source: ${name}`}>
      <Pill tone={tone} dot={variant !== 'neutral'}>{name}</Pill>
    </span>
  )
}

// ── OpsTypeText ───────────────────────────────────────────────────────────────
interface OpsTypeTextProps { eventType: LogEventType }
function OpsTypeText({ eventType }: OpsTypeTextProps) {
  return (
    <span
      className="ops-type-text"
      data-testid="ops-type-text"
    >
      {EVENT_TYPE_LABELS[eventType]}
    </span>
  )
}

// ── LinkedTaskRef ─────────────────────────────────────────────────────────────
interface LinkedTaskRefProps { task: TaskTitleRef }
function LinkedTaskRef({ task }: LinkedTaskRefProps) {
  return (
    <span className="ops-linked-task" data-testid="linked-task-ref">
      {/* link-in-context use of primary (the One Blue); accessible name is task title */}
      <svg
        className="ops-linked-icon"
        width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <Link to={`/tasks/${task.id}`} className="ops-task-link">
        {task.title}
      </Link>
      {' '}·{' '}
      <StatusPill status={task.status as TaskStatus} />
    </span>
  )
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function OpsSkeletonRow() {
  return (
    <li className="ops-skel-row" aria-hidden="true">
      <div className="ops-skel ops-skel--time" />
      <div className="ops-skel ops-skel--badge" />
      <div className="ops-skel ops-skel--title" />
    </li>
  )
}

// ── OpsLogRow ─────────────────────────────────────────────────────────────────
interface OpsLogRowProps {
  entry: LogEntryRow
  buName: string
  linkedTask?: TaskTitleRef
  isDesktop: boolean
  canEdit: boolean
  onArchive: (id: string, archived: boolean) => void
  isArchiving: boolean
}

function OpsLogRow({ entry, buName, linkedTask, isDesktop, canEdit, onArchive, isArchiving }: OpsLogRowProps) {
  const isArchived = entry.archived_at != null
  const wibTime = toWibTime(entry.occurred_at)
  const editLink = `/ops/${entry.id}/edit`

  const rowProps = {
    className: `ops-row${entry.needs_attention ? ' ops-row--attn' : ''}${isArchived ? ' ops-row--archived' : ''}${canEdit ? ' ops-row--editable' : ''}`,
    'data-attn': entry.needs_attention ? 'true' : undefined,
  }

  const sourceSection = (
    <>
      <OpsSourceBadge name={buName} />
      <OpsTypeText eventType={entry.event_type} />
      {entry.needs_attention && (
        <span className="sr-only">Needs attention</span>
      )}
    </>
  )

  const bodySection = (
    <>
      {isArchived && <span className="archived-tag">Archived</span>}
      <span className={isArchived ? 'ops-title ops-title--archived' : 'ops-title'}>
        {entry.title}
      </span>
      {entry.detail && (
        <span className="ops-detail" data-testid="ops-detail">
          {entry.detail}
        </span>
      )}
      {linkedTask && <LinkedTaskRef task={linkedTask} />}
    </>
  )

  return (
    <li {...rowProps}>
      {isDesktop ? (
        // Desktop: time | source+type | body
        <div className="ops-row-inner ops-row-inner--desktop">
          <time
            className="ops-time tabular-nums"
            dateTime={entry.occurred_at}
          >
            {wibTime}
          </time>
          <div className="ops-ev-head">
            {sourceSection}
          </div>
          <div className="ops-body">
            {bodySection}
          </div>
        </div>
      ) : (
        // Phone: ev-head (badge + type + time-right) | title | detail | linked
        <div className="ops-row-inner ops-row-inner--phone">
          <div className="ops-ev-head ops-ev-head--phone">
            {sourceSection}
            <time
              className="ops-time ops-time--phone tabular-nums"
              dateTime={entry.occurred_at}
            >
              {wibTime}
            </time>
          </div>
          <div className="ops-body">
            {bodySection}
          </div>
        </div>
      )}
      {canEdit && (
        <div
          className={`ops-row-actions ${isDesktop ? 'ops-row-actions--overlay' : 'ops-row-actions--phone'}`}
          data-testid="ops-row-actions"
        >
          <Link
            to={editLink}
            className={`ops-edit-btn ${isDesktop ? '' : 'ops-edit-btn--touch'}`.trim()}
            aria-label="Edit"
            title="Edit"
          >
            Edit
          </Link>
          <button
            type="button"
            className={`ops-archive-btn ${isDesktop ? '' : 'ops-archive-btn--touch'}`.trim()}
            aria-label={isArchived ? 'Unarchive' : 'Archive'}
            onClick={() => onArchive(entry.id, !isArchived)}
            disabled={isArchiving}
            title={isArchived ? 'Unarchive' : 'Archive'}
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      )}
    </li>
  )
}

// ── Main OpsPage ──────────────────────────────────────────────────────────────
export function OpsPage() {
  useDocumentTitle('Daily Log — Gordi MOS')
  const isDesktop = useIsDesktop()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  const now = useMemo(() => new Date(), [])
  const wib = weekLabel(now)

  // ── Filter state ─────────────────────────────────────────────────────────
  const [businessUnitId, setBusinessUnitId] = useState<string>('')
  const [eventType, setEventType] = useState<LogEventType | ''>('')
  const [includeArchived, setIncludeArchived] = useState(false)

  // ── Data state ───────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<LogEntryRow[]>([])
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [taskTitleMap, setTaskTitleMap] = useState<Map<string, TaskTitleRef>>(new Map())
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [archivingId, setArchivingId] = useState<string | null>(null)

  // ── buMap for quick name lookup ─────────────────────────────────────────
  const buMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const bu of busDirectory) m.set(bu.id, bu.name)
    return m
  }, [busDirectory])

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoadState('loading')
    const filters: LogFilters = {
      ...(businessUnitId ? { businessUnitId } : {}),
      ...(eventType ? { eventType: eventType as LogEventType } : {}),
      includeArchived,
    }

    let cancelled = false

    Promise.all([
      listLogEntries(filters),
      getBusinessUnits(),
    ]).then(async ([rows, bus]) => {
      if (cancelled) return
      setBusDirectory(bus)

      // Client-side linked-task title resolution (NFR-006, no cross-schema embed)
      const taskIds = [...new Set(rows.map(r => r.linked_task_id).filter(Boolean))] as string[]
      let taskRefs: TaskTitleRef[] = []
      if (taskIds.length > 0) {
        try {
          taskRefs = await getTaskTitlesByIds(taskIds)
        } catch {
          // Degrade gracefully — linked titles just won't resolve
        }
      }
      const tmap = new Map<string, TaskTitleRef>()
      for (const ref of taskRefs) tmap.set(ref.id, ref)

      if (!cancelled) {
        setEntries(rows)
        setTaskTitleMap(tmap)
        setLoadState('ready')
      }
    }).catch(() => {
      if (!cancelled) setLoadState('error')
    })

    return () => { cancelled = true }
  }, [businessUnitId, eventType, includeArchived])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  // ── Archive/unarchive ────────────────────────────────────────────────────
  async function handleArchive(id: string, archive: boolean) {
    setArchivingId(id)
    try {
      if (archive) {
        await archiveLogEntry(id)
      } else {
        await unarchiveLogEntry(id)
      }
      load()
    } catch {
      // Optimistic failure — just reload
      load()
    } finally {
      setArchivingId(null)
    }
  }

  // ── Per-viewer edit gate: author or manager ─────────────────────────────
  function canEditEntry(entry: LogEntryRow): boolean {
    if (!viewer) return false
    // author check (RLS enforces the manager half server-side)
    return entry.created_by === viewer.person.id || (viewer.isManager ?? false)
  }

  // ── Entry count for subtitle ─────────────────────────────────────────────
  const entryCount = entries.length
  const countLabel = loadState === 'ready'
    ? ` · ${entryCount} log entr${entryCount === 1 ? 'y' : 'ies'}`
    : ''

  // ── Empty copy ────────────────────────────────────────────────────────────
  const hasActiveFilter = businessUnitId !== '' || eventType !== '' || includeArchived
  function emptyTitle() {
    if (includeArchived && !businessUnitId && !eventType) return 'No archived log entries.'
    if (businessUnitId && busDirectory.length > 0) {
      const name = buMap.get(businessUnitId) ?? 'this source'
      return `No ${name} log entries match.`
    }
    if (eventType) return `No ${EVENT_TYPE_LABELS[eventType as LogEventType]} log entries yet.`
    return 'No log entries yet today.'
  }
  function emptyCopy() {
    if (hasActiveFilter) return 'Try clearing the filters to see more.'
    return 'Kitchen, Roastery, and the floor show up here as things happen. Add the first one.'
  }

  function clearFilters() {
    setBusinessUnitId('')
    setEventType('')
    setIncludeArchived(false)
  }

  return (
    <PageFrame>
      <PageHead
        title="Daily Log"
        meta={
          <span data-testid="ops-count-line" className="tabular-nums" style={{ color: 'var(--muted-foreground)', fontSize: 15 }}>
            {wib.today}{countLabel}
          </span>
        }
      />

      {/* Card assembly: toolbar seamed to feed */}
      <section className="ops-assembly" aria-label="Daily Log">

        {/* Toolbar */}
        <div className="ops-toolbar" role="search">
          {/* Source (BU) filter */}
          <label htmlFor="ops-source-filter" className="sr-only">Business unit</label>
          <div className="control">
            <span className="ctrl-lbl">Business unit</span>
            <select
              id="ops-source-filter"
              aria-label="Business unit"
              value={businessUnitId}
              onChange={e => setBusinessUnitId(e.target.value)}
              className="ctrl-select"
            >
              <option value="">All sources</option>
              {busDirectory.map(bu => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </select>
            <Chevron className="ctrl-chev" />
          </div>

          {/* Type filter */}
          <label htmlFor="ops-type-filter" className="sr-only">Type</label>
          <div className="control">
            <span className="ctrl-lbl">Type</span>
            <select
              id="ops-type-filter"
              aria-label="Type"
              value={eventType}
              onChange={e => setEventType(e.target.value as LogEventType | '')}
              className="ctrl-select"
            >
              <option value="">All</option>
              <option value="production">Production</option>
              <option value="receiving">Receiving</option>
              <option value="qc">QC</option>
              <option value="follow_up">Follow-up</option>
              <option value="other">Other</option>
            </select>
            <Chevron className="ctrl-chev" />
          </div>

          {/* Show archived toggle */}
          <label className="archived-toggle">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => setIncludeArchived(e.target.checked)}
              aria-label="Show archived"
              className="archived-checkbox"
            />
            <span className="archived-label">Show archived</span>
          </label>

          {/* Desktop: + Add log entry button */}
          {isDesktop && (
            <Link
              to="/ops/new"
              className="btn btn-primary ops-toolbar-add"
              aria-label="Add log entry"
            >
              + Add log entry
            </Link>
          )}
        </div>

        {/* Feed body — loading / error / empty / populated */}
        {loadState === 'loading' ? (
          <div aria-busy="true">
            <span className="sr-only" role="status">Loading the Daily Log</span>
            <ul className="ops-feed" aria-label="Daily Log" aria-busy="true" role="list">
              <OpsSkeletonRow />
              <OpsSkeletonRow />
              <OpsSkeletonRow />
              <OpsSkeletonRow />
            </ul>
          </div>
        ) : loadState === 'error' ? (
          <ErrorState message="Couldn't load the Daily Log" onRetry={load} />
        ) : entries.length === 0 ? (
          <EmptyState title={emptyTitle()} copy={emptyCopy()}>
            {hasActiveFilter && (
              <button type="button" className="btn btn-outline" onClick={clearFilters}>
                Clear filters
              </button>
            )}
            <Link to="/ops/new" className="btn btn-primary" aria-label="Add log entry">
              + Add log entry
            </Link>
          </EmptyState>
        ) : (
          <ul
            className="ops-feed"
            aria-label="Daily Log"
            role="list"
          >
            {entries.map(entry => (
              <OpsLogRow
                key={entry.id}
                entry={entry}
                buName={buMap.get(entry.business_unit_id) ?? entry.business_unit_id}
                linkedTask={entry.linked_task_id ? taskTitleMap.get(entry.linked_task_id) : undefined}
                isDesktop={isDesktop}
                canEdit={canEditEntry(entry)}
                onArchive={handleArchive}
                isArchiving={archivingId === entry.id}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Phone: sticky submit bar (44px full-width add target, FR-038) */}
      {!isDesktop && (
        <div className="ops-submit-bar">
          <Link
            to="/ops/new"
            className="btn btn-primary btn-touch"
            aria-label="Add log entry"
          >
            + Add log entry
          </Link>
        </div>
      )}

      {/* ── Inline CSS — DESIGN.md tokens only, no raw hex/px beyond token values ── */}
      <style>{`
        /* ── Page head ── */
        /* IA-1: the page head is the shared shell/PageHead.tsx (title + right-aligned meta).
           The bespoke .ops-page-head / .ops-page-title / .ops-count-line classes are gone. */

        /* ── Card assembly (OD-P3-10/11) ── */
        .ops-assembly {
          background: var(--card); border: 1px solid var(--border);
          border-radius: var(--radius-lg); /* 12px — card surface, OD-P3-10 */
          box-shadow: var(--shadow-rest); /* OD-P3-11 resting lift */
          overflow: hidden;
        }

        /* ── Toolbar ── */
        .ops-toolbar {
          display: flex; align-items: center; gap: 8px;
          flex-wrap: wrap; padding: 10px 12px;
          border-bottom: 1px solid var(--border);
        }
        .control {
          height: 32px; display: inline-flex; align-items: center; gap: 6px;
          padding: 0 10px; border: 1px solid var(--input);
          background: var(--background);
          border-radius: var(--radius-sm); /* 8px — control, OD-P3-10 */
          font-size: 13px; color: var(--foreground); cursor: pointer;
          position: relative;
        }
        .ctrl-lbl { color: var(--muted-foreground); font-size: 13px; }
        .ctrl-chev { color: var(--muted-foreground); font-size: 10px; pointer-events: none; }
        .ctrl-select {
          position: absolute; inset: 0; width: 100%; opacity: 0;
          cursor: pointer; font-size: 13px;
        }
        .archived-toggle {
          display: inline-flex; align-items: center; gap: 6px;
          height: 32px; padding: 0 10px; border: 1px solid var(--input);
          background: var(--background);
          border-radius: var(--radius-sm); /* 8px — control, OD-P3-10 */
          font-size: 13px; cursor: pointer; color: var(--foreground);
        }
        .archived-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: var(--primary); }
        .archived-label { font-size: 13px; }
        /* IXD-4 (PR-2): the toolbar add button uses .btn .btn-primary (ui/Button.css).
           This thin layout hook right-aligns it (was .ops-add-btn's margin-left:auto). */
        .ops-toolbar-add { margin-left: auto; }

        /* ── Feed list ── */
        .ops-feed {
          list-style: none; margin: 0; padding: 0;
        }

        /* ── Log row ── */
        .ops-row {
          position: relative;
          border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
          padding: 11px 12px;
          display: flex; align-items: flex-start; gap: 0;
        }
        .ops-row:last-child { border-bottom: none; }

        /* Needs-attention treatment (§3.3): amber 7% fill + 2px warning left rule */
        .ops-row--attn {
          background: color-mix(in srgb, var(--warning) 7%, transparent);  /* --ops-attn-row-bg */
          border-left: 2px solid var(--warning); /* --ops-attn-rule */
          padding-left: 10px;
          border-radius: 0 6px 6px 0; /* rounded.sm right corners */
        }
        .ops-row--archived {
          opacity: 0.7;
        }
        .ops-row--archived.ops-row--attn {
          background: transparent;
          border-left: 0;
          padding-left: 12px;
          border-radius: 0;
        }

        /* Desktop inner layout */
        .ops-row-inner--desktop {
          display: flex; align-items: flex-start; gap: 12px; flex: 1;
        }
        .ops-row--editable .ops-row-inner--desktop {
          padding-right: 112px;
        }
        .ops-time {
          color: var(--muted-foreground); font-size: 12px;
          width: 46px; flex: none; padding-top: 1px;
          font-variant-numeric: tabular-nums;
        }
        .ops-ev-head {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: none;
          min-width: 0;
        }
        .ops-body {
          display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
        }

        /* Phone inner layout */
        .ops-row-inner--phone {
          display: flex; flex-direction: column; gap: 4px; flex: 1;
        }
        .ops-ev-head--phone {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .ops-time--phone {
          margin-left: auto; width: auto;
        }

        /* ── Source badge (§3.1) ── */
        /* VIS-4 (PR-2): the source badge re-skins onto the shared <Pill> (ui/Pill.css):
           kitchen→primary, roastery→violet, neutral→neutral (dotless). The bespoke
           .ops-source-badge* / .ops-source-dot rules were removed. */

        /* ── Type text (§3.2) — muted text, no badge ── */
        .ops-type-text {
          font-size: 12px; font-weight: 600;
          color: var(--muted-foreground);
        }

        /* ── Title / body ── */
        .ops-title {
          font-size: 14px; color: var(--foreground);
        }
        .ops-title--archived {
          color: var(--muted-foreground); font-weight: 400;
        }
        .ops-detail {
          font-size: 12px; color: var(--muted-foreground);
          font-family: "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;
          font-weight: 500;
        }

        /* ── Linked task reference (§4.4) ── */
        .ops-linked-task {
          display: flex; align-items: center; gap: 5px;
          font-size: 13px; color: var(--muted-foreground); flex-wrap: wrap;
        }
        .ops-linked-icon { color: var(--muted-foreground); flex: none; }
        .ops-task-link {
          color: var(--primary); text-decoration: none;
          font-weight: 500;
        }
        .ops-task-link:hover { text-decoration: underline; }
        .ops-task-link:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

        /* ── Archived tag ── */
        .archived-tag {
          display: inline-flex; align-items: center;
          height: 18px; padding: 0 6px; border-radius: 4px;
          background: var(--secondary); color: var(--muted-foreground);
          font-size: 11px; font-weight: 500; white-space: nowrap; flex: none;
        }

        /* ── Row actions (edit + archive) ── */
        .ops-row-actions {
          display: flex;
        }
        .ops-row-actions--overlay {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          gap: 4px; opacity: 0; transition: opacity 0.1s;
        }
        .ops-row:hover .ops-row-actions--overlay,
        .ops-row:focus-within .ops-row-actions--overlay { opacity: 1; }
        .ops-row-actions--phone {
          position: static;
          margin-top: 8px;
          gap: 8px;
          width: 100%;
        }

        .ops-edit-btn {
          height: 28px; padding: 0 10px; border-radius: 6px;
          border: 1px solid var(--border); background: var(--background);
          font-size: 12px; font-weight: 500; color: var(--foreground); cursor: pointer;
          text-decoration: none; display: inline-flex; align-items: center; justify-content: center;
        }
        .ops-edit-btn--touch {
          min-height: 46px;
          flex: 1;
          padding: 0 12px;
          font-size: 13px;
          border-radius: var(--radius-sm); /* 8px — control, OD-P3-10 */
        }
        .ops-edit-btn:focus-visible {
          outline: 2px solid var(--ring); outline-offset: 2px;
        }
        .ops-edit-btn:hover { background: var(--accent); }

        /* ── Archive button (ghost ⋯, 32px, reveal on hover / always phone) ── */
        .ops-archive-btn {
          min-width: 32px; height: 32px; border-radius: var(--radius-sm); /* 8px — control, OD-P3-10 */
          border: 0; background: transparent; color: var(--muted-foreground);
          font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center;
          padding: 0 8px;
        }
        .ops-archive-btn--touch {
          min-height: 46px;
          flex: 1;
          padding: 0 12px;
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
        }
        .ops-archive-btn:focus-visible {
          outline: 2px solid var(--ring); outline-offset: 2px;
        }
        .ops-archive-btn:hover { background: var(--accent); color: var(--foreground); }

        /* ── Skeleton ── */
        .ops-skel-row {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 12px; border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
        }
        .ops-skel {
          background: var(--secondary); border-radius: 6px;
          animation: sk-pulse 1.4s ease-in-out infinite;
          height: 12px;
        }
        .ops-skel--time { width: 40px; flex: none; }
        .ops-skel--badge { width: 80px; height: 22px; border-radius: 999px; flex: none; }
        .ops-skel--title { flex: 1; }
        @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

        /* ── Error + Empty (IXD-5, PR-2) ── */
        /* The Daily Log error + empty states use the shared <ErrorState> / <EmptyState>
           (ui/StateKit → CardHead.css .error-state / .empty-state). The bespoke
           .ops-error-banner / .ops-error-text / .ops-retry-btn / .ops-empty-* /
           .ops-clear-btn rules were removed. Empty-state actions use .btn .btn-outline /
           .btn .btn-primary (ui/Button.css). */

        /* ── Phone submit bar (FR-038, 44px full-width) ── */
        .ops-submit-bar {
          position: sticky; bottom: 0; left: 0; right: 0;
          padding: 8px 12px;
          background: var(--background);
          border-top: 1px solid var(--border);
        }
        /* IXD-4 (PR-2): the submit-bar button uses .btn .btn-primary .btn-touch
           (ui/Button.css). The bespoke .ops-submit-bar-btn rule was removed. */

        @media (max-width: 767px) {
          .ops-row { display: block; }
          .ops-row--editable .ops-row-inner--desktop { padding-right: 0; }
          .ops-time--phone { align-self: flex-start; }
        }

        /* ── Utility ── */
        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
        }
        .tabular-nums { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
      `}</style>
    </PageFrame>
  )
}
