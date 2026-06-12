// OpsAddForm — /ops/new: Add/Edit log entry form (P2-3b, FR-040..047, AC-070..073)
// Design authority: docs/plans/2026-06-12-ops-log-design.md §5 + DESIGN.md tokens.
// Field grammar mirrors TaskCreate.tsx (.tc-field, .tc-label, .tc-input etc.).
// Dispatches CreateLogEntryInput — never sends org_id/created_by (NFR-002).
// Supports both create mode and edit mode (/:id/edit route).

import { useState, useEffect } from 'react'
import { useNavigate, Link, useParams } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { useAuth } from '../auth/useAuth'
import { addLogEntry, editLogEntry, getLogEntry } from '../lib/db/opsLog'
import type { LogEventType } from '../lib/db/opsLog.types'
import { getBusinessUnits } from '../lib/db/directory'
import type { BusinessUnitOption } from '../lib/db/directory'
import { listTasks } from '../lib/db/tasks'
import type { TaskListRow } from '../lib/db/tasks.types'

// Format a Date for a datetime-local input value (WIB offset, no host-tz leak)
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
function toDatetimeLocalWIB(d: Date): string {
  const wib = new Date(d.getTime() + WIB_OFFSET_MS)
  // yyyy-MM-ddTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}` +
    `T${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}`
  )
}

// Convert datetime-local string (WIB local) → UTC ISO
function datetimeLocalToUTCISO(local: string): string {
  // datetime-local is WIB, so subtract 7h to get UTC
  const asUTC = new Date(local).getTime() - WIB_OFFSET_MS
  return new Date(asUTC).toISOString()
}

export default function OpsAddForm() {
  const { id: entryId } = useParams<{ id: string }>()
  const isEditMode = !!entryId
  useDocumentTitle(isEditMode ? 'Edit log entry — Gordi MOS' : 'Add log entry — Gordi MOS')
  const navigate = useNavigate()
  const auth = useAuth()

  // Primary BU from viewer's first role (mirrors TaskCreate.tsx)
  const primaryRoleBU = auth.status === 'authenticated'
    ? (auth.viewer.roles[0]?.business_unit_id ?? '')
    : ''

  // ── Directory ────────────────────────────────────────────────────────────
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [taskDirectory, setTaskDirectory] = useState<TaskListRow[]>([])
  const [dirLoading, setDirLoading] = useState(true)

  useEffect(() => {
    Promise.all([getBusinessUnits(), listTasks({ includeArchived: false })]).then(([bus, tasks]) => {
      setBusDirectory(bus)
      setTaskDirectory(tasks)
      setDirLoading(false)
    }).catch(() => setDirLoading(false))
  }, [])

  // ── Load entry for edit mode ────────────────────────────────────────────────
  const [editLoading, setEditLoading] = useState(isEditMode)
  const [entryNotFound, setEntryNotFound] = useState(false)

  useEffect(() => {
    if (!isEditMode) {
      setEditLoading(false)
      return
    }
    getLogEntry(entryId!)
      .then(entry => {
        setBusinessUnitId(entry.business_unit_id)
        setEventType(entry.event_type)
        setTitle(entry.title)
        setDetail(entry.detail ?? '')
        setOccurredAt(toDatetimeLocalWIB(new Date(entry.occurred_at)))
        setNeedsAttention(entry.needs_attention)
        setLinkedTaskId(entry.linked_task_id ?? '')
        setEditLoading(false)
      })
      .catch(() => {
        setEntryNotFound(true)
        setEditLoading(false)
      })
  }, [isEditMode, entryId])

  // ── Form state ────────────────────────────────────────────────────────────
  const [businessUnitId, setBusinessUnitId] = useState(primaryRoleBU)
  const [eventType, setEventType] = useState<LogEventType>('other')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalWIB(new Date()))
  const [needsAttention, setNeedsAttention] = useState(false)
  const [linkedTaskId, setLinkedTaskId] = useState<string>('') // optional linked-task picker

  // Sync BU once directory + auth loads
  useEffect(() => {
    if (primaryRoleBU && !businessUnitId) {
      setBusinessUnitId(primaryRoleBU)
    }
  }, [primaryRoleBU, businessUnitId])

  // ── Validation ────────────────────────────────────────────────────────────
  const [titleError, setTitleError] = useState('')
  const [buError, setBuError] = useState('')

  const isValid = title.trim().length > 0 && businessUnitId !== ''

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    let valid = true
    if (!title.trim()) {
      setTitleError('Title is required')
      valid = false
    } else {
      setTitleError('')
    }
    if (!businessUnitId) {
      setBuError('Business unit is required')
      valid = false
    } else {
      setBuError('')
    }
    if (!valid) return

    setSubmitting(true)
    setSubmitError('')
    try {
      const payload = {
        businessUnitId,
        eventType,
        title: title.trim(),
        detail: detail.trim() || null,
        occurredAt: datetimeLocalToUTCISO(occurredAt),
        needsAttention,
        linkedTaskId: linkedTaskId || null,
      }

      if (isEditMode) {
        await editLogEntry(entryId!, payload)
      } else {
        await addLogEntry(payload)
      }
      navigate('/ops', { replace: false })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  if (entryNotFound) {
    return (
      <PageFrame>
        <div className="tc-page-head">
          <h1 className="tc-page-title">Log entry not found</h1>
        </div>
        <div className="tc-card">
          <p className="tc-error-msg">
            The log entry you&apos;re trying to edit doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <Link to="/ops" className="tc-btn-cancel">Back to Ops Log</Link>
        </div>
      </PageFrame>
    )
  }

  if (editLoading || dirLoading) {
    return (
      <PageFrame>
        <div className="tc-page-head">
          <h1 className="tc-page-title">Loading…</h1>
        </div>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="tc-breadcrumb">
        <Link to="/ops" className="tc-breadcrumb-link">Daily ops feed</Link>
        <span className="tc-breadcrumb-sep" aria-hidden="true"> / </span>
        <span className="tc-breadcrumb-current">{isEditMode ? 'Edit log entry' : 'Add log entry'}</span>
      </nav>

      <div className="tc-page-head">
        <h1 className="tc-page-title">{isEditMode ? 'Edit log entry' : 'Add log entry'}</h1>
      </div>

      <div className="tc-card">
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label={isEditMode ? 'Edit log entry' : 'Add log entry'}
          role="form"
        >
          {submitError && (
            <div role="alert" className="tc-submit-error">
              {submitError}
            </div>
          )}

          {/* Business unit */}
          <div className="tc-field">
            <label htmlFor="ops-bu" className="tc-label">
              Business unit <span aria-hidden="true" className="tc-required">*</span>
            </label>
            {dirLoading ? (
              <div className="tc-loading-field">Loading…</div>
            ) : (
              <select
                id="ops-bu"
                className={`tc-select${buError ? ' tc-input-error' : ''}`}
                value={businessUnitId}
                onChange={e => { setBusinessUnitId(e.target.value); if (buError) setBuError('') }}
                aria-required="true"
                aria-invalid={buError ? 'true' : undefined}
                aria-describedby={buError ? 'ops-bu-err' : undefined}
                disabled={submitting}
                aria-label="Business unit"
              >
                <option value="">Select business unit…</option>
                {busDirectory.map(bu => (
                  <option key={bu.id} value={bu.id}>{bu.name}</option>
                ))}
              </select>
            )}
            {buError && (
              <span id="ops-bu-err" role="alert" className="tc-field-error">{buError}</span>
            )}
          </div>

          {/* Type */}
          <div className="tc-field">
            <label htmlFor="ops-type" className="tc-label">Type</label>
            <select
              id="ops-type"
              className="tc-select"
              value={eventType}
              onChange={e => setEventType(e.target.value as LogEventType)}
              disabled={submitting}
              aria-label="Type"
            >
              <option value="production">Production</option>
              <option value="receiving">Receiving</option>
              <option value="qc">QC</option>
              <option value="follow_up">Follow-up</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Title */}
          <div className="tc-field">
            <label htmlFor="ops-title" className="tc-label">
              Title <span aria-hidden="true" className="tc-required">*</span>
            </label>
            <input
              id="ops-title"
              type="text"
              className={`tc-input${titleError ? ' tc-input-error' : ''}`}
              value={title}
              onChange={e => { setTitle(e.target.value); if (titleError) setTitleError('') }}
              aria-required="true"
              aria-invalid={titleError ? 'true' : undefined}
              aria-describedby={titleError ? 'ops-title-err' : undefined}
              placeholder="What happened?"
              disabled={submitting}
              aria-label="Title"
            />
            {titleError && (
              <span id="ops-title-err" role="alert" className="tc-field-error">{titleError}</span>
            )}
          </div>

          {/* Detail (optional) */}
          <div className="tc-field">
            <label htmlFor="ops-detail" className="tc-label">Detail</label>
            <textarea
              id="ops-detail"
              className="tc-textarea"
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={3}
              placeholder="Optional — quantities, batch IDs, who signed off…"
              disabled={submitting}
            />
          </div>

          {/* Occurred at */}
          <div className="tc-field">
            <label htmlFor="ops-occurred-at" className="tc-label">Occurred at</label>
            <input
              id="ops-occurred-at"
              type="datetime-local"
              className="tc-input"
              value={occurredAt}
              onChange={e => setOccurredAt(e.target.value)}
              disabled={submitting}
              aria-label="Occurred at"
            />
          </div>

          {/* Needs attention toggle */}
          <div className="tc-field tc-field--inline">
            <label className="tc-inline-label" htmlFor="ops-needs-attn">
              <input
                id="ops-needs-attn"
                type="checkbox"
                checked={needsAttention}
                onChange={e => setNeedsAttention(e.target.checked)}
                disabled={submitting}
                className="tc-checkbox"
                aria-label="Needs attention"
              />
              Needs attention
              {needsAttention && (
                <span
                  className="ops-attn-hint"
                  aria-live="polite"
                >
                  — this log entry will show the amber warning signal
                </span>
              )}
            </label>
          </div>

          {/* Linked task (optional; FR-045) */}
          <div className="tc-field">
            <label htmlFor="ops-linked-task" className="tc-label">Linked task</label>
            {dirLoading ? (
              <div className="tc-loading-field">Loading…</div>
            ) : (
              <select
                id="ops-linked-task"
                className="tc-select"
                value={linkedTaskId}
                onChange={e => setLinkedTaskId(e.target.value)}
                disabled={submitting}
                aria-label="Linked task"
              >
                <option value="">None</option>
                {taskDirectory && taskDirectory.map(task => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
            )}
          </div>

          {/* Actions */}
          <div className="tc-actions">
            <Link to="/ops" className="tc-btn-cancel">Cancel</Link>
            <button
              type="submit"
              className="tc-btn-submit"
              disabled={!isValid || submitting}
              aria-busy={submitting}
            >
              {submitting ? (isEditMode ? 'Saving…' : 'Adding…') : (isEditMode ? 'Save changes' : 'Add log entry')}
            </button>
          </div>
        </form>
      </div>

      {/* ── Inline CSS — DESIGN.md tokens, mirrors TaskCreate.tsx ── */}
      <style>{`
        .tc-breadcrumb { font-size: 13px; color: hsl(var(--muted-foreground)); margin-bottom: 12px; }
        .tc-breadcrumb-link { color: hsl(var(--muted-foreground)); text-decoration: none; }
        .tc-breadcrumb-link:hover { color: hsl(var(--foreground)); }
        .tc-breadcrumb-link:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
        .tc-breadcrumb-sep { margin: 0 6px; }
        .tc-breadcrumb-current { color: hsl(var(--foreground)); font-weight: 500; }

        .tc-page-head { margin-bottom: 16px; }
        .tc-page-title { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: hsl(var(--foreground)); }

        .tc-card {
          max-width: 640px;
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; padding: 20px 24px;
        }

        .tc-submit-error {
          padding: 10px 12px; margin-bottom: 16px; border-radius: 6px;
          background: hsl(var(--destructive) / 0.10); color: hsl(var(--destructive));
          font-size: 13px; border: 1px solid hsl(var(--destructive) / 0.25);
        }

        .tc-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
        .tc-field--inline { flex-direction: row; align-items: center; gap: 8px; }
        .tc-label { font-size: 13px; font-weight: 500; color: hsl(var(--foreground)); }
        .tc-inline-label {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: hsl(var(--foreground)); cursor: pointer;
        }
        .tc-required { color: hsl(var(--destructive)); margin-left: 2px; }

        .tc-input, .tc-select, .tc-textarea {
          width: 100%; height: 36px; padding: 0 12px;
          border: 1px solid hsl(var(--input)); border-radius: 8px;
          background: hsl(var(--background)); font: inherit; font-size: 14px;
          color: hsl(var(--foreground));
        }
        .tc-input:focus-visible, .tc-select:focus-visible, .tc-textarea:focus-visible {
          outline: 2px solid hsl(var(--ring)); outline-offset: 2px;
        }
        .tc-input-error { border-color: hsl(var(--destructive)); }
        .tc-textarea { height: auto; padding: 8px 12px; resize: vertical; }
        .tc-select { cursor: pointer; }
        .tc-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: hsl(var(--primary)); flex: none; }

        .tc-field-error { font-size: 12px; color: hsl(var(--destructive)); }

        .tc-loading-field {
          height: 36px; display: flex; align-items: center;
          font-size: 13px; color: hsl(var(--muted-foreground));
        }

        /* Needs-attention amber hint text (§3.3 — warning-foreground, AA contrast) */
        .ops-attn-hint {
          font-size: 12px; color: hsl(22 78% 26%); /* warning-foreground */
        }

        .tc-error-msg {
          font-size: 14px; color: hsl(var(--foreground)); margin-bottom: 16px;
        }

        .tc-actions {
          display: flex; justify-content: flex-end; gap: 8px;
          padding-top: 8px; border-top: 1px solid hsl(var(--border)); margin-top: 8px;
        }
        .tc-btn-cancel {
          height: 32px; padding: 0 12px; border-radius: 8px;
          border: 1px solid hsl(var(--border)); background: hsl(var(--background));
          font-size: 13px; font-weight: 500; color: hsl(var(--foreground));
          text-decoration: none; display: inline-flex; align-items: center;
        }
        .tc-btn-cancel:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
        .tc-btn-submit {
          height: 32px; padding: 0 16px; border-radius: 8px; border: 0;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
          box-shadow: 0 1px 2px hsl(221.2 83.2% 53.3% / 0.25);
        }
        .tc-btn-submit:hover { opacity: 0.92; }
        .tc-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .tc-btn-submit:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
      `}</style>
    </PageFrame>
  )
}
