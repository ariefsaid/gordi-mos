import { useState } from 'react'
import type { ChecklistItemRow } from '../../lib/db/tasks.types'

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
}

export function ChecklistCard({ items, canEdit: editable, onAdd, onToggle, onReorder, onDelete }: ChecklistCardProps) {
  const [draft, setDraft] = useState('')
  const done = items.filter(i => i.is_done).length

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && draft.trim()) {
      onAdd(draft.trim())
      setDraft('')
    }
  }

  return (
    <section className="card" aria-label="Checklist">
      <h2 className="card-h2">
        Checklist
        {items.length > 0 && (
          <span className="checklist-count tabular-nums">{done} of {items.length} done</span>
        )}
      </h2>

      {/* M7: empty Checklist always shows the empty line (plan §3.2); editors
          additionally get the add field below it. */}
      {items.length === 0 && (
        <p className="empty-substate">No steps yet.</p>
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
                  aria-label={`Move up ${item.label}`}
                  disabled={idx === 0}
                  onClick={() => onReorder(item.id, 'up')}
                >▲</button>
                <button
                  type="button"
                  className="checklist-ctrl-btn"
                  aria-label={`Move down ${item.label}`}
                  disabled={idx === items.length - 1}
                  onClick={() => onReorder(item.id, 'down')}
                >▼</button>
                <button
                  type="button"
                  className="checklist-ctrl-btn checklist-ctrl-delete"
                  aria-label={`Delete checklist item ${item.label}`}
                  onClick={() => onDelete(item.id)}
                >×</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <input
          type="text"
          className="checklist-add-input"
          placeholder="+ Add a step"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Add checklist item"
        />
      )}
    </section>
  )
}
