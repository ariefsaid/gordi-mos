import { useRef, useState } from 'react'
import type { ChecklistItemRow } from '@/lib/db/tasks.types'
import { useT } from '@/i18n/use-t'

// ── Checklist card ───────────────────────────────────────────────────────────
export type ChecklistCardProps = {
  items: ChecklistItemRow[]
  canEdit: boolean
  taskId: string
  viewerId: string
  // #965: the input clears its draft only once this resolves — same contract as CommentThread.
  onAdd: (label: string) => void | Promise<void>
  onToggle: (id: string, isDone: boolean) => void
  onReorder: (id: string, direction: 'up' | 'down') => void
  onDelete: (id: string) => void
  // OD-REDESIGN-22 (D-C1): the last FAILED write, as a visible message + a retry that re-runs it.
  // null (default) = no error.
  saveError?: { message: string; onRetry: () => void | Promise<void> } | null
}

export function ChecklistCard({ items, canEdit: editable, onAdd, onToggle, onReorder, onDelete, saveError = null }: ChecklistCardProps) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const done = items.filter(i => i.is_done).length
  // Live draft, read after an await — `draft` itself is a stale closure by then. Lets a commit
  // tell "still the text I sent" from "the person typed something new while it was in flight".
  const draftRef = useRef('')
  function changeDraft(value: string) {
    draftRef.current = value
    setDraft(value)
  }

  // #965: clear the draft only once the write resolves AND it still holds what was sent — a
  // rejection, or new text typed meanwhile, both keep whatever is in the field now.
  async function submit() {
    const label = draft.trim()
    if (!label || posting) return
    setPosting(true)
    try {
      await onAdd(label)
      if (draftRef.current.trim() === label) changeDraft('')
    } catch {
      // saveError (below) already surfaces the visible error + Retry; this just keeps the draft.
    } finally {
      setPosting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && draft.trim()) {
      void submit()
    }
  }

  // #965: Retry re-runs the SAME failed write, so it clears on the same terms as a fresh submit.
  async function retry() {
    if (!saveError || posting) return
    const label = draft.trim()
    setPosting(true)
    try {
      await saveError.onRetry()
      if (draftRef.current.trim() === label) changeDraft('')
    } catch {
      // stays failed; the parent re-sets saveError with a fresh retry closure.
    } finally {
      setPosting(false)
    }
  }

  return (
    // Content-first anatomy (OD-REDESIGN-90): the Checklist region landmark is the labeled content
    // slot that wraps this card (`<section data-content-slot="checklist" aria-label>`), so this is a
    // plain container — not a second nested region or a card-in-card (LAW-7). The visible h2 stays.
    <div className="card">
      <h2 className="card-h2">
        {t('tasks.checklistTitle')}
        {items.length > 0 && (
          <span className="checklist-count tabular-nums">{t('tasks.checklist.done', { done, total: items.length })}</span>
        )}
      </h2>

      {/* M7: empty Checklist always shows the empty line (plan §3.2); editors
          additionally get the add field below it. */}
      {items.length === 0 && (
        <p className="empty-substate">{t('tasks.checklist.noSteps')}</p>
      )}

      <ul className="checklist-list">
        {items.map((item, idx) => (
          <li key={item.id} className="checklist-item">
            <input
              type="checkbox"
              id={`chk-${item.id}`}
              role="checkbox"
              aria-checked={item.is_done}
              checked={item.is_done}
              disabled={!editable}
              aria-label={item.label}
              onChange={() => editable && onToggle(item.id, !item.is_done)}
              className="checklist-checkbox"
            />
            <label
              htmlFor={`chk-${item.id}`}
              className={item.is_done ? 'checklist-label checklist-done' : 'checklist-label'}
            >
              {item.label}
            </label>
            {editable && (
              <div className="checklist-controls">
                <button
                  type="button"
                  className="checklist-ctrl-btn"
                  aria-label={t('tasks.checklist.moveUp', { label: item.label })}
                  disabled={idx === 0}
                  onClick={() => onReorder(item.id, 'up')}
                >▲</button>
                <button
                  type="button"
                  className="checklist-ctrl-btn"
                  aria-label={t('tasks.checklist.moveDown', { label: item.label })}
                  disabled={idx === items.length - 1}
                  onClick={() => onReorder(item.id, 'down')}
                >▼</button>
                <button
                  type="button"
                  className="checklist-ctrl-btn checklist-ctrl-delete"
                  aria-label={t('tasks.checklist.delete', { label: item.label })}
                  onClick={() => onDelete(item.id)}
                >×</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {saveError && (
        <p role="alert" className="checklist-save-error">
          {saveError.message}
          <button type="button" className="checklist-retry" onClick={() => void retry()}>
            {t('record.field.retry')}
          </button>
        </p>
      )}

      {editable && (
        <input
          type="text"
          className="checklist-add-input"
          placeholder={t('tasks.checklist.addPlaceholder')}
          value={draft}
          onChange={e => changeDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('tasks.checklist.addAria')}
        />
      )}
    </div>
  )
}
