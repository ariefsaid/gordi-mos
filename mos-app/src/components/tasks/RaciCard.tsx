import { useState } from 'react'
import type { TaskListRow } from '../../lib/db/tasks.types'
import type { PersonOption } from '../../lib/db/directory'
import { initials } from './taskFormatters'
import { PersonPicker } from './PersonPicker'

// ── RACI card ────────────────────────────────────────────────────────────────
export type RaciCardProps = {
  task: TaskListRow
  people: PersonOption[]
  canEdit: boolean
  viewerId: string
  onRaciChange: (patch: Partial<Pick<TaskListRow, 'consulted_person_ids' | 'informed_person_ids'>>) => void
  onRaChange: (patch: Partial<Pick<TaskListRow, 'responsible_person_id' | 'accountable_person_id'>>) => void
}

export function RaciCard({ task, people, canEdit: editable, onRaciChange, onRaChange }: RaciCardProps) {
  const [showCPicker, setShowCPicker] = useState(false)
  const [showIPicker, setShowIPicker] = useState(false)
  // I2: R/A pickers
  const [showRPicker, setShowRPicker] = useState(false)
  const [showAPicker, setShowAPicker] = useState(false)

  function personName(id: string) {
    return people.find(p => p.id === id)?.full_name ?? id
  }

  function removeConsulted(id: string) {
    onRaciChange({ consulted_person_ids: task.consulted_person_ids.filter(x => x !== id) })
  }
  function removeInformed(id: string) {
    onRaciChange({ informed_person_ids: task.informed_person_ids.filter(x => x !== id) })
  }
  function addConsulted(id: string) {
    if (!task.consulted_person_ids.includes(id)) {
      onRaciChange({ consulted_person_ids: [...task.consulted_person_ids, id] })
    }
  }
  function addInformed(id: string) {
    if (!task.informed_person_ids.includes(id)) {
      onRaciChange({ informed_person_ids: [...task.informed_person_ids, id] })
    }
  }

  const rName = personName(task.responsible_person_id)
  const aName = personName(task.accountable_person_id)

  return (
    <section className="card" aria-label="RACI">
      <h2 className="card-h2">RACI</h2>
      <div className="raci-grid">
        {/* Responsible — I2: editable picker for editors */}
        <div className="raci-field">
          <div className="raci-label">
            <span className="role-chip role-chip-r">
              <span className="role-marker" aria-hidden="true">R</span>
              Responsible
            </span>
          </div>
          {editable ? (
            <>
              <button
                type="button"
                className="person-field-btn"
                aria-label="Change Responsible"
                aria-haspopup="listbox"
                aria-expanded={showRPicker}
                onClick={() => setShowRPicker(o => !o)}
              >
                <span className="person-av" aria-hidden="true">{initials(rName)}</span>
                <span className="person-name">{rName}</span>
                <span className="person-field-edit-hint" aria-hidden="true">▾</span>
              </button>
              {showRPicker && (
                <PersonPicker
                  people={people}
                  onSelect={id => onRaChange({ responsible_person_id: id })}
                  onClose={() => setShowRPicker(false)}
                />
              )}
            </>
          ) : (
            <div className="person-field" aria-label={`Responsible: ${rName}`}>
              <span className="person-av" aria-hidden="true">{initials(rName)}</span>
              <span className="person-name">{rName}</span>
            </div>
          )}
        </div>

        {/* Accountable — I2: editable picker for editors */}
        <div className="raci-field">
          <div className="raci-label">
            <span className="role-chip role-chip-a">
              <span className="role-marker" aria-hidden="true">A</span>
              Accountable
            </span>
          </div>
          {editable ? (
            <>
              <button
                type="button"
                className="person-field-btn"
                aria-label="Change Accountable"
                aria-haspopup="listbox"
                aria-expanded={showAPicker}
                onClick={() => setShowAPicker(o => !o)}
              >
                <span className="person-av person-av-a" aria-hidden="true">{initials(aName)}</span>
                <span className="person-name">{aName}</span>
                <span className="person-field-edit-hint" aria-hidden="true">▾</span>
              </button>
              {showAPicker && (
                <PersonPicker
                  people={people}
                  onSelect={id => onRaChange({ accountable_person_id: id })}
                  onClose={() => setShowAPicker(false)}
                />
              )}
            </>
          ) : (
            <div className="person-field" aria-label={`Accountable: ${aName}`}>
              <span className="person-av person-av-a" aria-hidden="true">{initials(aName)}</span>
              <span className="person-name">{aName}</span>
            </div>
          )}
        </div>

        {/* Consulted */}
        <div className="raci-field" data-testid="raci-consulted">
          <div className="raci-label">
            <span className="role-chip role-chip-ci">
              <span className="role-marker role-marker-ci" aria-hidden="true">C</span>
              Consulted
            </span>
          </div>
          <div className="multi-field">
            {task.consulted_person_ids.map(id => (
              <span key={id} className="chip-person" data-testid="chip-consulted">
                <span className="person-av chip-av" aria-hidden="true">{initials(personName(id))}</span>
                <span className="chip-name">{personName(id)}</span>
                {editable && (
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove Consulted person ${personName(id)}`}
                    onClick={() => removeConsulted(id)}
                  >×</button>
                )}
              </span>
            ))}
            {editable && (
              <>
                <button
                  type="button"
                  className="add-person-btn"
                  onClick={() => setShowCPicker(true)}
                  aria-label="Add Consulted person"
                >+ Add</button>
                {showCPicker && (
                  <PersonPicker
                    people={people}
                    onSelect={addConsulted}
                    onClose={() => setShowCPicker(false)}
                    exclude={task.consulted_person_ids}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Informed */}
        <div className="raci-field" data-testid="raci-informed">
          <div className="raci-label">
            <span className="role-chip role-chip-ci">
              <span className="role-marker role-marker-ci" aria-hidden="true">I</span>
              Informed
            </span>
          </div>
          <div className="multi-field">
            {task.informed_person_ids.map(id => (
              <span key={id} className="chip-person" data-testid="chip-informed">
                <span className="person-av chip-av" aria-hidden="true">{initials(personName(id))}</span>
                <span className="chip-name">{personName(id)}</span>
                {editable && (
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove Informed ${personName(id)}`}
                    onClick={() => removeInformed(id)}
                  >×</button>
                )}
              </span>
            ))}
            {editable && (
              <>
                <button
                  type="button"
                  className="add-person-btn"
                  onClick={() => setShowIPicker(true)}
                  aria-label="Add Informed person"
                >+ Add</button>
                {showIPicker && (
                  <PersonPicker
                    people={people}
                    onSelect={addInformed}
                    onClose={() => setShowIPicker(false)}
                    exclude={task.informed_person_ids}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
