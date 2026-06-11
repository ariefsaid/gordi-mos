import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { useAuth } from '../auth/useAuth'
import { createTask } from '../lib/db/tasks'
import type { CreateTaskInput } from '../lib/db/tasks'
import { getBusinessUnits, getPeople } from '../lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '../lib/db/directory'


// ── Create form component ─────────────────────────────────────────────────────
export default function TaskCreate() {
  useDocumentTitle('New task — Gordi MOS')
  const navigate = useNavigate()
  const auth = useAuth()

  // Viewer details
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  // Primary-role BU: first role's business_unit_id (ordered by created_at asc from resolveViewer)
  const primaryRoleBU = auth.status === 'authenticated'
    ? (auth.viewer.roles[0]?.business_unit_id ?? '')
    : ''

  // Directory
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])
  const [dirLoading, setDirLoading] = useState(true)

  useEffect(() => {
    Promise.all([getBusinessUnits(), getPeople()]).then(([bus, people]) => {
      setBusDirectory(bus)
      setPeopleDirectory(people)
      setDirLoading(false)
    }).catch(() => setDirLoading(false))
  }, [])

  // ── Form state ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [businessUnitId, setBusinessUnitId] = useState(primaryRoleBU)
  const [responsiblePersonId, setResponsiblePersonId] = useState(viewerId)
  const [accountablePersonId, setAccountablePersonId] = useState(viewerId)
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')

  // Set BU once directory loads (in case primaryRoleBU wasn't set at mount)
  useEffect(() => {
    if (primaryRoleBU && !businessUnitId) {
      setBusinessUnitId(primaryRoleBU)
    }
  }, [primaryRoleBU, businessUnitId])

  // ── Validation state ──────────────────────────────────────────────────────
  const [titleError, setTitleError] = useState('')
  const [buError, setBuError] = useState('')

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Validate
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
      const input: CreateTaskInput = {
        title: title.trim(),
        businessUnitId,
        responsiblePersonId,
        accountablePersonId,
        createdBy: viewerId,
        description: description.trim() || undefined,
        dueDate: dueDate || null,
      }
      const newId = await createTask(input)
      navigate(`/tasks/${newId}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <PageFrame>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="tc-breadcrumb">
        <Link to="/tasks" className="tc-breadcrumb-link">Tasks</Link>
        <span className="tc-breadcrumb-sep" aria-hidden="true"> / </span>
        <span className="tc-breadcrumb-current">New task</span>
      </nav>

      <div className="tc-page-head">
        <h1 className="tc-page-title">New task</h1>
      </div>

      <div className="tc-card">
        <form onSubmit={handleSubmit} noValidate aria-label="Create task form">
          {submitError && (
            <div role="alert" className="tc-submit-error">
              {submitError}
            </div>
          )}

          {/* Title */}
          <div className="tc-field">
            <label htmlFor="task-title" className="tc-label">
              Title <span aria-hidden="true" className="tc-required">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              className={`tc-input${titleError ? ' tc-input-error' : ''}`}
              value={title}
              onChange={e => { setTitle(e.target.value); if (titleError) setTitleError('') }}
              aria-required="true"
              aria-invalid={titleError ? 'true' : undefined}
              aria-describedby={titleError ? 'title-err' : undefined}
              placeholder="What needs to be done?"
              disabled={submitting}
              aria-label="Title"
            />
            {titleError && (
              <span id="title-err" role="alert" className="tc-field-error">{titleError}</span>
            )}
          </div>

          {/* Business unit */}
          <div className="tc-field">
            <label htmlFor="task-bu" className="tc-label">
              Business unit <span aria-hidden="true" className="tc-required">*</span>
            </label>
            {dirLoading ? (
              <div className="tc-loading-field">Loading…</div>
            ) : (
              <select
                id="task-bu"
                className={`tc-select${buError ? ' tc-input-error' : ''}`}
                value={businessUnitId}
                onChange={e => { setBusinessUnitId(e.target.value); if (buError) setBuError('') }}
                aria-required="true"
                aria-invalid={buError ? 'true' : undefined}
                aria-describedby={buError ? 'bu-err' : undefined}
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
              <span id="bu-err" role="alert" className="tc-field-error">{buError}</span>
            )}
          </div>

          {/* Responsible (R) — pre-filled to creator, editable */}
          <div className="tc-field">
            <label htmlFor="task-responsible" className="tc-label">
              Responsible (R) <span aria-hidden="true" className="tc-required">*</span>
            </label>
            {dirLoading ? (
              <div className="tc-loading-field">Loading…</div>
            ) : (
              <select
                id="task-responsible"
                className="tc-select"
                value={responsiblePersonId}
                onChange={e => setResponsiblePersonId(e.target.value)}
                disabled={submitting}
                aria-label="Responsible (R)"
                aria-required="true"
              >
                {peopleDirectory.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Accountable (A) — pre-filled to creator, editable */}
          <div className="tc-field">
            <label htmlFor="task-accountable" className="tc-label">
              Accountable (A) <span aria-hidden="true" className="tc-required">*</span>
            </label>
            {dirLoading ? (
              <div className="tc-loading-field">Loading…</div>
            ) : (
              <select
                id="task-accountable"
                className="tc-select"
                value={accountablePersonId}
                onChange={e => setAccountablePersonId(e.target.value)}
                disabled={submitting}
                aria-label="Accountable (A)"
                aria-required="true"
              >
                {peopleDirectory.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Due date (optional) */}
          <div className="tc-field">
            <label htmlFor="task-due" className="tc-label">Due date</label>
            <input
              id="task-due"
              type="date"
              className="tc-input"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Description (optional) */}
          <div className="tc-field">
            <label htmlFor="task-desc" className="tc-label">Description</label>
            <textarea
              id="task-desc"
              className="tc-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional context, goals, or notes…"
              disabled={submitting}
            />
          </div>

          {/* Actions */}
          <div className="tc-actions">
            <Link to="/tasks" className="tc-btn-cancel">Cancel</Link>
            <button
              type="submit"
              className="tc-btn-submit"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>

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
        .tc-label { font-size: 13px; font-weight: 500; color: hsl(var(--foreground)); }
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

        .tc-field-error { font-size: 12px; color: hsl(var(--destructive)); }

        .tc-loading-field {
          height: 36px; display: flex; align-items: center;
          font-size: 13px; color: hsl(var(--muted-foreground));
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
