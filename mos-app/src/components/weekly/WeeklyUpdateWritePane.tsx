// WeeklyUpdateWritePane — the author's write/edit pane for a single week's update (PR-b).
// Design authority: docs/plans/2026-06-12-weekly-updates-design.md §2 + signed mock pane A.
// All states: loading skeleton / error+Retry / empty / draft-with-content / submitted-locked.
// AC-031..038, FR-010/012/013/014/015/016/017/018/019.
import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { formatAge } from '../tasks/taskFormatters'
import './WeeklyUpdateWritePane.css'
import type { WeeklyUpdateItemRow, ProgressMarker as ProgressMarkerType } from '../../lib/db/weeklyUpdates.types'
import { getMyUpdate, upsertDraft, submit as submitUpdate, reopen as reopenUpdate } from '../../lib/db/weeklyUpdates'
import { weekLabel, weeklyUpdateTiming } from '../../lib/week'
import { ProgressMarker, ProgressMarkerPicker } from './ProgressMarker'

// ── Local item shape (draft lines before persist) ────────────────────────────
interface DraftLine {
  localId: string          // client-side stable key (not the DB id yet)
  id?: string              // DB id if persisted
  label: string
  progress: ProgressMarkerType
  position: number
}

function makeDraftLine(position: number): DraftLine {
  return { localId: crypto.randomUUID(), label: '', progress: 'in_progress', position }
}

// Skeleton placeholder — matches final card height to avoid layout shift (§5.1)
// I3 fix: uses .wup-skeleton-block CSS class which has @keyframes wup-pulse + reduced-motion support.
function WritePaneSkeleton() {
  return (
    <div data-testid="write-pane-skeleton" aria-hidden="true">
      <div className="wup-skeleton-block" style={{ minHeight: 96, marginBottom: 12 }} />
      {[1, 2].map(i => (
        <div key={i} className="wup-skeleton-block" style={{ height: 40, marginBottom: 8 }} />
      ))}
    </div>
  )
}

// ── TimingChip — on-time / late signal (§2.5 design-plan) ───────────────────
function TimingChip({ submittedAt, weekStart }: { submittedAt: string; weekStart: string }) {
  const timing = weeklyUpdateTiming(submittedAt, weekStart)
  const onTime = timing === 'on-time'
  // on-time: success/14% bg + --status-won-text; late: warning/18% bg + warning-foreground
  const style: React.CSSProperties = onTime
    ? { background: 'hsl(142 71% 45% / 0.14)', color: 'hsl(142 64% 30%)' }  // success/14% / --status-won-text
    : { background: 'hsl(43 96% 56% / 0.18)', color: 'hsl(22 78% 26%)' }    // warning/18% / warning-foreground
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 22, padding: '0 9px', borderRadius: 999,
        fontSize: 12, fontWeight: 600, ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6, height: 6, borderRadius: 999, flexShrink: 0,
          background: onTime ? 'hsl(142 71% 45%)' : 'hsl(43 96% 56%)',
        }}
      />
      {onTime ? 'on time' : 'late'}
    </span>
  )
}

// ── Line row (editable) ──────────────────────────────────────────────────────
interface LineRowProps {
  line: DraftLine
  isFirst: boolean
  isLast: boolean
  onChange: (localId: string, patch: Partial<DraftLine>) => void
  onRemove: (localId: string) => void
  onMoveUp: (localId: string) => void
  onMoveDown: (localId: string) => void
}

function LineRow({ line, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown }: LineRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Expose ref for focus-after-add (T-043)
  useEffect(() => {
    if (line.label === '') {
      inputRef.current?.focus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      data-testid="update-line-row"
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: 12, padding: '10px 0',
        borderBottom: !isLast ? '1px solid hsl(240 5.9% 90% / 0.7)' : undefined,
      }}
    >
      {/* Reorder handle — keyboard operable (§5.3) */}
      <button
        type="button"
        aria-label="Reorder line"
        title="Drag to reorder"
        style={{
          background: 'none', border: 'none', cursor: 'grab',
          color: 'hsl(240 4% 40%)', padding: 4, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 32, minHeight: 44, /* ≥44px touch target */
          flexShrink: 0,
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowUp' || (e.key === 'Enter' && !isFirst)) {
            e.preventDefault(); onMoveUp(line.localId)
          }
          if (e.key === 'ArrowDown' || (e.key === 'Enter' && !isLast)) {
            e.preventDefault(); onMoveDown(line.localId)
          }
        }}
      >
        {/* grip icon (stroke-2, 18px) */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/>
        </svg>
      </button>

      {/* Line text input — inline edit (§2.2)
          I1 fix: wup-line-input class applies flex-basis:100% at <768px so text occupies
          full-width row 1 while handle/marker/remove wrap to row 2 (flexWrap:wrap on parent). */}
      <input
        ref={inputRef}
        type="text"
        value={line.label}
        onChange={e => onChange(line.localId, { label: e.target.value })}
        placeholder="Tulis update line…"
        aria-label="Update line text"
        className="wup-line-input"
        style={{
          flex: '1 1 100%', minWidth: 0,
          border: 'none', background: 'transparent',
          fontSize: 14, color: 'hsl(240 10% 3.9%)', /* foreground */
          fontFamily: 'inherit',
          padding: 0,
          /* Focus ring via global *:focus-visible */
        }}
      />

      {/* Progress marker picker (§2.2, §4.3) */}
      <ProgressMarkerPicker
        progress={line.progress}
        onSelect={val => onChange(line.localId, { progress: val })}
      />

      {/* Remove button (§2.2) */}
      <button
        type="button"
        aria-label="Remove line"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'hsl(240 4% 40%)', padding: 4, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 32, minHeight: 44, /* ≥44px touch target */
          flexShrink: 0,
        }}
        onClick={() => onRemove(line.localId)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}

// ── Static line row (submitted/locked) ──────────────────────────────────────
function StaticLineRow({ item, isLast }: { item: WeeklyUpdateItemRow; isLast: boolean }) {
  return (
    <div
      data-testid="update-line-row-static"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
        borderBottom: !isLast ? '1px solid hsl(240 5.9% 90% / 0.7)' : undefined,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'hsl(240 10% 3.9%)' }}>
        {item.label}
      </span>
      <ProgressMarker progress={item.progress} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface WeeklyUpdateWritePaneProps {
  personId: string
  createdBy: string
  /** ISO week-start date 'YYYY-MM-DD' */
  weekStart: string
}

export default function WeeklyUpdateWritePane({ personId, createdBy, weekStart }: WeeklyUpdateWritePaneProps) {
  const now = new Date()
  const wib = weekLabel(now)
  const summaryId = useId()

  // ── State ────────────────────────────────────────────────────────────────
  type LoadState = 'loading' | 'error' | 'ready'
  const [loadState, setLoadState]     = useState<LoadState>('loading')

  // Local editable state (draft)
  const [summary, setSummary]     = useState('')
  const [lines, setLines]         = useState<DraftLine[]>([])
  const [status, setStatus]       = useState<'draft' | 'submitted'>('draft')
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [updateId, setUpdateId]   = useState<string | undefined>(undefined)

  // Save/submit busy + confirm
  const [saving, setSaving]       = useState(false)
  const [saveConfirm, setSaveConfirm] = useState(false)
  const [savedAt, setSavedAt]     = useState<Date | null>(null)
  const [saveError, setSaveError]  = useState<string | null>(null)
  const liveRef = useRef<HTMLDivElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const result = await getMyUpdate(personId, weekStart)
      if (result) {
        setSummary(result.update.summary)
        setStatus(result.update.status)
        setSubmittedAt(result.update.submitted_at)
        setUpdateId(result.update.id)
        setLines(result.items.map(item => ({
          localId: item.id,
          id: item.id,
          label: item.label,
          progress: item.progress,
          position: item.position,
        })))
      } else {
        setSummary('')
        setStatus('draft')
        setSubmittedAt(null)
        setUpdateId(undefined)
        setLines([])
      }
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [personId, weekStart])

  useEffect(() => { load() }, [load])

  // ── Derived ───────────────────────────────────────────────────────────────
  const isLocked       = status === 'submitted'
  const isEmpty        = summary.trim() === '' && lines.length === 0
  const submitDisabled = isEmpty

  // ── Line mutations ────────────────────────────────────────────────────────
  const handleLineChange = useCallback((localId: string, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map(l => l.localId === localId ? { ...l, ...patch } : l))
  }, [])

  const handleAddLine = useCallback(() => {
    setLines(prev => {
      const pos = prev.length + 1
      return [...prev, makeDraftLine(pos)]
    })
  }, [])

  const handleRemoveLine = useCallback((localId: string) => {
    setLines(prev => prev.filter(l => l.localId !== localId).map((l, i) => ({ ...l, position: i + 1 })))
  }, [])

  const handleMoveUp = useCallback((localId: string) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.localId === localId)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next.map((l, i) => ({ ...l, position: i + 1 }))
    })
  }, [])

  const handleMoveDown = useCallback((localId: string) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.localId === localId)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next.map((l, i) => ({ ...l, position: i + 1 }))
    })
  }, [])

  // ── Shared payload builder ────────────────────────────────────────────────
  const buildLinesPayload = useCallback(() =>
    lines.map(l => ({
      id: l.id,
      label: l.label,
      progress: l.progress,
      position: l.position,
    }))
  , [lines])

  // ── Save draft (AC-035) ───────────────────────────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const id = await upsertDraft({
        id: updateId,
        personId,
        weekStart,
        createdBy,
        summary,
        lines: buildLinesPayload(),
      })
      setUpdateId(id)
      setSavedAt(new Date())
      setSaveConfirm(true)
      // Clear confirm after 5s
      setTimeout(() => setSaveConfirm(false), 5000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [updateId, personId, weekStart, createdBy, summary, buildLinesPayload])

  // ── Submit (AC-036) — unified handler for both new + existing update ──────
  const handleSubmit = useCallback(async () => {
    if (submitDisabled || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Upsert with current updateId (undefined = new, existing id = update)
      const id = await upsertDraft({
        id: updateId,
        personId,
        weekStart,
        createdBy,
        summary,
        lines: buildLinesPayload(),
      })
      setUpdateId(id)
      await submitUpdate(id)
      setStatus('submitted')
      // Optimistically set submitted_at to now for timing chip
      setSubmittedAt(new Date().toISOString())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSaving(false)
    }
  }, [submitDisabled, saving, updateId, personId, weekStart, createdBy, summary, buildLinesPayload])

  // ── Reopen (AC-037) ───────────────────────────────────────────────────────
  const handleReopen = useCallback(async () => {
    if (!updateId || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await reopenUpdate(updateId)
      setStatus('draft')
      setSubmittedAt(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Reopen failed')
    } finally {
      setSaving(false)
    }
  }, [updateId, saving])

  // ── Render ────────────────────────────────────────────────────────────────

  // Loading skeleton (AC-038)
  if (loadState === 'loading') {
    return (
      <section
        aria-label="My weekly update"
        className="bg-card border border-border rounded-md"
        style={{ padding: '16px 20px' }}
      >
        <WritePaneSkeleton />
      </section>
    )
  }

  // Error state (AC-038) — role=alert so screen reader announces it
  if (loadState === 'error') {
    return (
      <section
        aria-label="My weekly update"
        className="bg-card border border-border rounded-md"
        style={{ padding: '16px 20px' }}
      >
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'hsl(240 4% 40%)' }}>
            Couldn't load your update
          </span>
          <button
            type="button"
            onClick={load}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8,
              border: '1px solid hsl(240 5.9% 90%)',
              background: 'hsl(0 0% 100%)', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              color: 'hsl(240 10% 3.9%)',
            }}
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  // Week pill (§1.2 design-plan, tabular)
  const WeekPill = (
    <span
      data-testid="week-pill"
      className="tabular-nums"
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 22, padding: '0 9px', borderRadius: 999,
        background: 'hsl(240 4.8% 95.9%)', /* secondary */
        color: 'hsl(240 4% 40%)', /* muted-foreground */
        fontSize: 12, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      Week of {wib.range}
    </span>
  )

  // ── Submitted (locked) render (AC-031, §2.4) ──────────────────────────────
  if (isLocked) {
    return (
      <section
        aria-label="My weekly update"
        className="bg-card border border-border rounded-md"
        style={{ padding: '16px 20px' }}
      >
        {/* Head row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>My weekly update</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {WeekPill}
            {/* Submitted lifecycle pill (§2.4) */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 22, padding: '0 9px', borderRadius: 999,
              background: 'hsl(142 71% 45% / 0.14)', color: 'hsl(142 64% 30%)', /* success/14% / --status-won-text */
              fontSize: 12, fontWeight: 600,
            }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'hsl(142 71% 45%)', flexShrink: 0 }} />
              Submitted
            </span>
            {submittedAt && <TimingChip submittedAt={submittedAt} weekStart={weekStart} />}
          </div>
        </div>

        {/* Summary — static text (no textarea, AC-031) */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'hsl(240 4% 40%)', marginBottom: 6 }}>
            This week's summary
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: 'hsl(240 10% 3.9%)', whiteSpace: 'pre-wrap' }}>
            {summary || <span style={{ color: 'hsl(240 4% 40%)' }}>(no summary)</span>}
          </p>
        </div>

        {/* Update lines — read-only; derived from local state (single source of truth, FIX-1) */}
        {lines.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'hsl(240 4% 40%)', marginBottom: 8 }}>
              Update lines
            </div>
            {lines.map((l, i) => (
              <StaticLineRow
                key={l.localId}
                item={{ id: l.localId, org_id: '', weekly_update_id: '', label: l.label, progress: l.progress, position: l.position, created_at: '', updated_at: '' }}
                isLast={i === lines.length - 1}
              />
            ))}
          </div>
        )}

        {/* Reopen action (§2.4) */}
        <div style={{ borderTop: '1px solid hsl(240 5.9% 90%)', paddingTop: 14, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={handleReopen}
            disabled={saving}
            aria-busy={saving ? 'true' : undefined}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8,
              border: '1px solid hsl(240 5.9% 90%)',
              background: 'hsl(0 0% 100%)', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              color: 'hsl(240 10% 3.9%)',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Reopen to edit
          </button>
          {submittedAt && (
            <span
              className="tabular-nums"
              style={{ fontSize: 12, color: 'hsl(240 4% 40%)', fontVariantNumeric: 'tabular-nums' }}
            >
              Submitted {submittedAt ? new Date(submittedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : ''}
            </span>
          )}
          {saveError && (
            <span role="alert" style={{ fontSize: 12, color: 'hsl(0 72% 45%)' }}>
              {saveError}
            </span>
          )}
        </div>
      </section>
    )
  }

  // ── Draft / Empty editable render (AC-032, AC-033) ────────────────────────
  return (
    <section
      aria-label="My weekly update"
      className="bg-card border border-border rounded-md"
      style={{ padding: '16px 20px' }}
    >
      {/* Head row (§2.1) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>My weekly update</h2>
        {WeekPill}
      </div>

      {/* Summary field (§2.1) */}
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor={summaryId}
          style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'hsl(240 4% 40%)', marginBottom: 6 }}
        >
          This week's summary
        </label>
        <textarea
          id={summaryId}
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Ringkasan minggu ini…"
          rows={4}
          style={{
            width: '100%', display: 'block',
            border: '1px solid hsl(240 5.9% 90%)', /* input */
            borderRadius: 8, /* rounded.md */
            padding: 10,
            minHeight: 96,
            fontSize: 14, lineHeight: 1.5, /* body */
            color: 'hsl(240 10% 3.9%)', /* foreground */
            background: 'hsl(0 0% 100%)',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Update-line editor (§2.2) */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'hsl(240 4% 40%)', marginBottom: 8 }}>
          Update lines
        </div>
        {lines.map((line, i) => (
          <LineRow
            key={line.localId}
            line={line}
            isFirst={i === 0}
            isLast={i === lines.length - 1}
            onChange={handleLineChange}
            onRemove={handleRemoveLine}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}
        {/* Add line affordance (§2.2) */}
        <button
          type="button"
          onClick={handleAddLine}
          style={{
            marginTop: lines.length > 0 ? 8 : 0,
            display: 'flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 12px', borderRadius: 8,
            border: '1px solid hsl(240 5.9% 90%)', /* input border */
            background: 'hsl(0 0% 100%)', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            color: 'hsl(240 10% 3.9%)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add line
        </button>
      </div>

      {/* Save error */}
      {saveError && (
        <div role="alert" style={{ fontSize: 13, color: 'hsl(0 72% 45%)', marginBottom: 8 }}>
          {saveError}
        </div>
      )}

      {/* Action cluster — co-located from first paint (§2.3, AC-032, IxD bar) */}
      <div style={{ borderTop: '1px solid hsl(240 5.9% 90%)', paddingTop: 14, marginTop: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* Save draft (§2.3) */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            aria-busy={saving ? 'true' : undefined}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8,
              border: '1px solid hsl(240 5.9% 90%)',
              background: 'hsl(0 0% 100%)', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              color: 'hsl(240 10% 3.9%)',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Save draft
          </button>

          {/* Submit update (§2.3, AC-033)
              C1 fix: use ONE backgroundColor key only — removing the conflicting `background`
              shorthand that React was clobbering. Enabled = primary token; disabled = primary
              token at opacity:0.5 (visual dim, not a separate color). */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            aria-disabled={submitDisabled || saving ? 'true' : 'false'}
            aria-busy={saving ? 'true' : undefined}
            style={{
              height: 32, padding: '0 12px', borderRadius: 8, border: 0,
              backgroundColor: 'hsl(221.2 83.2% 53.3%)', /* primary — always set, opacity dims when disabled */
              color: 'hsl(0 0% 98%)', /* primary-foreground */
              cursor: submitDisabled || saving ? 'not-allowed' : 'pointer',
              opacity: submitDisabled || saving ? 0.5 : 1,
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              boxShadow: submitDisabled || saving ? 'none' : '0 1px 2px hsl(221.2 83.2% 53.3% / 0.25)',
              pointerEvents: submitDisabled ? 'none' : undefined,
            }}
          >
            Submit update
          </button>

          {/* Quiet save confirm — aria-live polite, ambient (AC-035)
              M1 fix: "Draft saved · 2 min ago" relative time suffix (§2.3 plan). */}
          <div
            ref={liveRef}
            aria-live="polite"
            aria-atomic="true"
            style={{ marginLeft: 'auto', minWidth: 0 }}
          >
            {saveConfirm && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'hsl(142 64% 30%)' }}>
                {/* --status-won-text */}
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'hsl(142 71% 45%)', flexShrink: 0 }} />
                Draft saved{savedAt ? ` · ${formatAge(savedAt.toISOString(), new Date())} ago` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Submit disabled hint (§2.3, WCAG) */}
        {submitDisabled && (
          <p className="sr-only" aria-live="polite">
            Add a summary or a line to submit
          </p>
        )}
      </div>
    </section>
  )
}
