import { useState } from 'react'
import type { ChecklistItemRow } from '@/lib/db/tasks.types'
import { useT } from '@/i18n/use-t'

// ── Checklist card ───────────────────────────────────────────────────────────
export type ChecklistCardProps = {
  items: ChecklistItemRow[]
  canEdit: boolean
  taskId: string
  viewerId: string
  onAdd: (label: string) => void
  onToggle: (id: string, isDone: boolean) => void
  onReorder: (id: string, direction: 'up' | 'down') => void
  onDelete: (id: string) => void
  /**
   * OD-REDESIGN-22 (D-C1): when the last optimistic checklist write FAILED, the owner passes a
   * visible error message + a retry that re-runs it. `null` (default) = no error. The optimistic
   * rollback already reverts the row visually; this adds the clickable Retry a sighted user needs.
   */
  saveError?: { message: string; onRetry: () => void } | null
}

export function ChecklistCard({ items, canEdit: editable, onAdd, onToggle, onReorder, onDelete, saveError = null }: ChecklistCardProps) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const done = items.filter(i => i.is_done).length

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && draft.trim()) {
      onAdd(draft.trim())
      setDraft('')
    }
  }

  return (
    <section className="card" aria-label={t('tasks.checklistTitle')}>
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
          <button type="button" className="checklist-retry" onClick={saveError.onRetry}>
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
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('tasks.checklist.addAria')}
        />
      )}
    </section>
  )
}
