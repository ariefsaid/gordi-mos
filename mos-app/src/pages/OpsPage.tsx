// OpsPage — Daily ops feed (P2-3b, FR-030..037/039, AC-060..067)
// Design authority: docs/plans/2026-06-12-ops-log-design.md + DESIGN.md tokens.
// Data: listLogEntries (ops schema, RLS-scoped), getBusinessUnits (directory),
//       getTaskTitlesByIds (client-side linked-task resolution, NFR-006).

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { useIsDesktop } from '../shell/useIsDesktop'
import { listLogEntries, archiveLogEntry, unarchiveLogEntry } from '../lib/db/opsLog'
import type { LogFilters } from '../lib/db/opsLog'
import type { LogEntryRow, LogEventType } from '../lib/db/opsLog.types'
import { getBusinessUnits } from '../lib/db/directory'
import type { BusinessUnitOption } from '../lib/db/directory'
import { getTaskTitlesByIds } from '../lib/db/tasks'
import type { TaskTitleRef } from '../lib/db/tasks'
import { StatusPill } from '../components/tasks/StatusPill'
import type { TaskStatus } from '../lib/db/tasks.types'
import { weekLabel } from '../lib/week'

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
function OpsSourceBadge({ name }: OpsSourceBadgeProps) {
  const variant = sourceBadgeVariant(name)
  return (
    <span
      className={`ops-source-badge ops-source-badge--${variant}`}
      data-testid="ops-source-badge"
      aria-label={`Source: ${name}`}
    >
      {variant !== 'neutral' && (
        <span className="ops-source-dot" aria-hidden="true" />
      )}
      {name}
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
export default function OpsPage() {
  useDocumentTitle('Daily ops feed — Gordi MOS')
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
      <div className="ops-page-head">
        <h1 className="ops-page-title">Daily ops feed</h1>
        <span className="ops-count-line tabular-nums">
          {wib.today}{countLabel}
        </span>
      </div>

      {/* Card assembly: toolbar seamed to feed */}
      <section className="ops-assembly" aria-label="Daily ops feed">

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
            <span className="ctrl-chev" aria-hidden="true">▾</span>
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
            <span className="ctrl-chev" aria-hidden="true">▾</span>
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
              className="ops-add-btn"
              aria-label="Add log entry"
            >
              + Add log entry
            </Link>
          )}
        </div>

        {/* Feed body — loading / error / empty / populated */}
        {loadState === 'loading' ? (
          <div aria-busy="true">
            <span className="sr-only" role="status">Loading the Ops Log</span>
            <ul className="ops-feed" aria-label="Ops Log" aria-busy="true" role="list">
              <OpsSkeletonRow />
              <OpsSkeletonRow />
              <OpsSkeletonRow />
              <OpsSkeletonRow />
            </ul>
          </div>
        ) : loadState === 'error' ? (
          <div role="alert" className="ops-error-banner">
            <span className="ops-error-text">
              Couldn&apos;t load the Ops Log
            </span>
            <button type="button" className="ops-retry-btn" onClick={load}>
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="ops-empty-state">
            <h2 className="ops-empty-title">{emptyTitle()}</h2>
            <p className="ops-empty-copy">{emptyCopy()}</p>
            {hasActiveFilter && (
              <button type="button" className="ops-clear-btn" onClick={clearFilters}>
                Clear filters
              </button>
            )}
            <Link to="/ops/new" className="ops-add-btn ops-add-btn--empty" aria-label="Add log entry">
              + Add log entry
            </Link>
          </div>
        ) : (
          <ul
            className="ops-feed"
            aria-label="Ops Log"
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
            className="ops-submit-bar-btn"
            aria-label="Add log entry"
          >
            + Add log entry
          </Link>
        </div>
      )}

      {/* ── Inline CSS — DESIGN.md tokens only, no raw hex/px beyond token values ── */}
      <style>{`
        /* ── Page head ── */
        .ops-page-head {
          display: flex; align-items: baseline; gap: 12px;
          margin-bottom: 16px; flex-wrap: wrap;
        }
        .ops-page-title {
          font-size: 24px; font-weight: 700; line-height: 1.2;
          letter-spacing: -0.02em; color: hsl(var(--foreground));
        }
        .ops-count-line { color: hsl(var(--muted-foreground)); font-size: 13px; }

        /* ── Card assembly ── */
        .ops-assembly {
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; overflow: hidden;
        }

        /* ── Toolbar ── */
        .ops-toolbar {
          display: flex; align-items: center; gap: 8px;
          flex-wrap: wrap; padding: 10px 12px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .control {
          height: 32px; display: inline-flex; align-items: center; gap: 6px;
          padding: 0 10px; border: 1px solid hsl(var(--input));
          background: hsl(var(--background)); border-radius: 8px;
          font-size: 13px; color: hsl(var(--foreground)); cursor: pointer;
          position: relative;
        }
        .ctrl-lbl { color: hsl(var(--muted-foreground)); font-size: 13px; }
        .ctrl-chev { color: hsl(var(--muted-foreground)); font-size: 10px; pointer-events: none; }
        .ctrl-select {
          position: absolute; inset: 0; width: 100%; opacity: 0;
          cursor: pointer; font-size: 13px;
        }
        .archived-toggle {
          display: inline-flex; align-items: center; gap: 6px;
          height: 32px; padding: 0 10px; border: 1px solid hsl(var(--input));
          background: hsl(var(--background)); border-radius: 8px;
          font-size: 13px; cursor: pointer; color: hsl(var(--foreground));
        }
        .archived-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: hsl(var(--primary)); }
        .archived-label { font-size: 13px; }
        .ops-add-btn {
          margin-left: auto; display: inline-flex; align-items: center;
          height: 32px; padding: 0 12px; border-radius: 8px;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          text-decoration: none; font-size: 13px; font-weight: 600;
          box-shadow: 0 1px 2px hsl(221.2 83.2% 53.3% / 0.25);
          border: 0; cursor: pointer;
        }
        .ops-add-btn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

        /* ── Feed list ── */
        .ops-feed {
          list-style: none; margin: 0; padding: 0;
        }

        /* ── Log row ── */
        .ops-row {
          position: relative;
          border-bottom: 1px solid hsl(var(--border) / 0.7);
          padding: 11px 12px;
          display: flex; align-items: flex-start; gap: 0;
        }
        .ops-row:last-child { border-bottom: none; }

        /* Needs-attention treatment (§3.3): amber 7% fill + 2px warning left rule */
        .ops-row--attn {
          background: hsl(43 96% 56% / 0.07);  /* --ops-attn-row-bg */
          border-left: 2px solid hsl(43 96% 56%); /* --ops-attn-rule */
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
          color: hsl(var(--muted-foreground)); font-size: 12px;
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
        .ops-source-badge {
          display: inline-flex; align-items: center; gap: 5px;
          height: 22px; padding: 0 9px; border-radius: 999px;
          font-size: 12px; font-weight: 600; white-space: nowrap;
          background: hsl(var(--secondary)); color: hsl(var(--muted-foreground));
        }
        .ops-source-badge--kitchen {
          background: hsl(221.2 83.2% 53.3% / 0.10);
          color: hsl(221 75% 38%);
        }
        .ops-source-badge--roastery {
          background: hsl(262 83% 58% / 0.12);
          color: hsl(262 60% 42%);
        }
        .ops-source-dot {
          width: 6px; height: 6px; border-radius: 999px; flex: none;
        }
        .ops-source-badge--kitchen .ops-source-dot { background: hsl(221.2 83.2% 53.3%); }
        .ops-source-badge--roastery .ops-source-dot { background: hsl(262 83% 58%); }

        /* ── Type text (§3.2) — muted text, no badge ── */
        .ops-type-text {
          font-size: 12px; font-weight: 600;
          color: hsl(var(--muted-foreground));
        }

        /* ── Title / body ── */
        .ops-title {
          font-size: 14px; color: hsl(var(--foreground));
        }
        .ops-title--archived {
          color: hsl(var(--muted-foreground)); font-weight: 400;
        }
        .ops-detail {
          font-size: 12px; color: hsl(var(--muted-foreground));
          font-family: "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;
          font-weight: 500;
        }

        /* ── Linked task reference (§4.4) ── */
        .ops-linked-task {
          display: flex; align-items: center; gap: 5px;
          font-size: 13px; color: hsl(var(--muted-foreground)); flex-wrap: wrap;
        }
        .ops-linked-icon { color: hsl(var(--muted-foreground)); flex: none; }
        .ops-task-link {
          color: hsl(var(--primary)); text-decoration: none;
          font-weight: 500;
        }
        .ops-task-link:hover { text-decoration: underline; }
        .ops-task-link:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

        /* ── Archived tag ── */
        .archived-tag {
          display: inline-flex; align-items: center;
          height: 18px; padding: 0 6px; border-radius: 4px;
          background: hsl(var(--secondary)); color: hsl(var(--muted-foreground));
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
          border: 1px solid hsl(var(--border)); background: hsl(var(--background));
          font-size: 12px; font-weight: 500; color: hsl(var(--foreground)); cursor: pointer;
          text-decoration: none; display: inline-flex; align-items: center; justify-content: center;
        }
        .ops-edit-btn--touch {
          min-height: 46px;
          flex: 1;
          padding: 0 12px;
          font-size: 13px;
          border-radius: 8px;
        }
        .ops-edit-btn:focus-visible {
          outline: 2px solid hsl(var(--ring)); outline-offset: 2px;
        }
        .ops-edit-btn:hover { background: hsl(var(--accent)); }

        /* ── Archive button (ghost ⋯, 32px, reveal on hover / always phone) ── */
        .ops-archive-btn {
          min-width: 32px; height: 32px; border-radius: 8px;
          border: 0; background: transparent; color: hsl(var(--muted-foreground));
          font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center;
          padding: 0 8px;
        }
        .ops-archive-btn--touch {
          min-height: 46px;
          flex: 1;
          padding: 0 12px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }
        .ops-archive-btn:focus-visible {
          outline: 2px solid hsl(var(--ring)); outline-offset: 2px;
        }
        .ops-archive-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }

        /* ── Skeleton ── */
        .ops-skel-row {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 12px; border-bottom: 1px solid hsl(var(--border) / 0.7);
        }
        .ops-skel {
          background: hsl(var(--secondary)); border-radius: 6px;
          animation: sk-pulse 1.4s ease-in-out infinite;
          height: 12px;
        }
        .ops-skel--time { width: 40px; flex: none; }
        .ops-skel--badge { width: 80px; height: 22px; border-radius: 999px; flex: none; }
        .ops-skel--title { flex: 1; }
        @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

        /* ── Error banner ── */
        .ops-error-banner {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 20px; font-size: 13px;
        }
        .ops-error-text { color: hsl(var(--destructive)); flex: 1; }
        .ops-retry-btn {
          height: 32px; padding: 0 12px; border-radius: 8px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background)); font-size: 13px;
          color: hsl(var(--foreground)); cursor: pointer; font-weight: 600;
        }
        .ops-retry-btn:hover { background: hsl(var(--accent)); }

        /* ── Empty state ── */
        .ops-empty-state { text-align: left; padding: 28px 20px; }
        .ops-empty-title {
          font-size: 15px; font-weight: 600; margin-bottom: 4px;
          color: hsl(var(--foreground));
        }
        .ops-empty-copy {
          font-size: 13px; color: hsl(var(--muted-foreground)); margin-bottom: 12px;
        }
        .ops-add-btn--empty {
          margin-left: 0;
        }
        .ops-clear-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          padding: 0 12px;
          margin-right: 8px;
          border-radius: 8px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .ops-clear-btn:hover { background: hsl(var(--accent)); }
        .ops-clear-btn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

        /* ── Phone submit bar (FR-038, 44px full-width) ── */
        .ops-submit-bar {
          position: sticky; bottom: 0; left: 0; right: 0;
          padding: 8px 12px;
          background: hsl(var(--background));
          border-top: 1px solid hsl(var(--border));
        }
        .ops-submit-bar-btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; min-height: 44px;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;
          box-shadow: 0 1px 2px hsl(221.2 83.2% 53.3% / 0.25);
        }
        .ops-submit-bar-btn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

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
