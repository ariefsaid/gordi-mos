import { useRef, useState } from 'react'
import type { ChecklistItemRow } from '@/lib/db/tasks.types'
import { useT } from '@/i18n/use-t'
import { RecordMenu } from '@/components/record/record-menu'

// ── Checklist ────────────────────────────────────────────────────────────────
// The body of the record's Checklist section: the section header (title and "n of m done") belongs
// to the record page; this renders the steps, each with one row menu, and the add input.
export type ChecklistCardProps = {
  items: ChecklistItemRow[]
  canEdit: boolean
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
  // Live draft, read after an await — `draft` itself is a stale closure by then. Lets a commit
  // tell "still the text I sent" from "the person typed something new while it was in flight".
  const draftRef = useRef('')
  // #969: the label of the last failed add — what Retry actually re-sends, whatever the field holds now.
  const failedLabelRef = useRef<string | null>(null)
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
      failedLabelRef.current = null
      if (draftRef.current.trim() === label) changeDraft('')
    } catch {
      failedLabelRef.current = label
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

  // #965/#969: Retry re-sends the failed label, so it clears the field only while it still holds that label.
  async function retry() {
    if (!saveError || posting) return
    const label = failedLabelRef.current
    setPosting(true)
    try {
      await saveError.onRetry()
      failedLabelRef.current = null
      if (label !== null && draftRef.current.trim() === label) changeDraft('')
    } catch {
      // stays failed; the parent re-sets saveError with a fresh retry closure.
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="checklist">
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
              <RecordMenu
                label={t('tasks.checklist.rowActions', { label: item.label })}
                minItems={1}
                items={[
                  { id: 'up', label: t('tasks.checklist.menuMoveUp'), disabled: idx === 0, onSelect: () => onReorder(item.id, 'up') },
                  { id: 'down', label: t('tasks.checklist.menuMoveDown'), disabled: idx === items.length - 1, onSelect: () => onReorder(item.id, 'down') },
                  { id: 'remove', label: t('tasks.checklist.menuRemove'), destructive: true, separatorBefore: true, onSelect: () => onDelete(item.id) },
                ]}
              />
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
