import { useState } from 'react'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { initials } from './task-formatters'
import { PersonPicker } from './person-picker'
import { Chevron } from '@/shell/icons'

/**
 * The canonical Task ownership block. The database still stores the legacy
 * person columns for compatibility, but a Task surface presents the domain
 * vocabulary: Team, PIC, and Supervisor.
 */
export type TaskOwnershipCardProps = {
  task: TaskListRow
  teamName: string
  people: PersonOption[]
  canEdit: boolean
  onPicChange: (personId: string) => void
}

export function TaskOwnershipCard({
  task, teamName, people, canEdit, onPicChange,
}: TaskOwnershipCardProps) {
  const [showPicPicker, setShowPicPicker] = useState(false)

  function personName(id: string) {
    return people.find(person => person.id === id)?.full_name ?? id
  }

  const picName = personName(task.responsible_person_id)
  const supervisorName = personName(task.accountable_person_id)

  return (
    <section className="card task-ownership-card" aria-label="Task ownership">
      <div className="task-ownership-grid">
        <div className="task-owner-field">
          <div className="task-owner-label">Team</div>
          <div className="task-owner-value">{teamName}</div>
        </div>

        <div className="task-owner-field task-owner-field-pic">
          <div className="task-owner-label">PIC</div>
          {canEdit ? (
            <>
              <button
                type="button"
                className="person-field-btn"
                aria-label="Reassign PIC"
                aria-haspopup="listbox"
                aria-expanded={showPicPicker}
                onClick={() => setShowPicPicker(open => !open)}
              >
                <span className="person-av" aria-hidden="true">{initials(picName)}</span>
                <span className="person-name">{picName}</span>
                <Chevron className="person-field-edit-hint" />
              </button>
              {showPicPicker && (
                <PersonPicker
                  people={people}
                  onSelect={id => {
                    setShowPicPicker(false)
                    onPicChange(id)
                  }}
                  onClose={() => setShowPicPicker(false)}
                />
              )}
            </>
          ) : (
            <div className="person-field" aria-label={`PIC: ${picName}`}>
              <span className="person-av" aria-hidden="true">{initials(picName)}</span>
              <span className="person-name">{picName}</span>
            </div>
          )}
        </div>

        <div className="task-owner-field">
          <div className="task-owner-label">Supervisor</div>
          <div className="person-field" aria-label={`Supervisor: ${supervisorName}`}>
            <span className="person-av" aria-hidden="true">{initials(supervisorName)}</span>
            <span className="person-name">{supervisorName}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
