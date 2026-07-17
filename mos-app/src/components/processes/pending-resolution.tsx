import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import { PersonPicker } from '@/components/tasks/person-picker'
import type { PersonOption } from '@/lib/db/directory'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import { resolvePendingTask } from '@/lib/db/processes'
import './pending-resolution.css'

// PendingResolution (Step 6 / ADR-0051, B7, AC-624 / OD-41). The job sentence: "Two people could
// own this — you pick who." A `reason='multiple'` item offers its named candidates directly; a
// `reason='none'` (vacant) item offers the full org picker — reuses the existing PersonPicker
// (Rule 11 — no second picker implementation).

export interface PendingResolutionProps {
  pending: PendingTaskRow
  /** Full org roster — resolves candidate ids to names and backs the vacant-path full picker. */
  people: PersonOption[]
  onResolved?: (taskId: string) => void
}

function personName(people: PersonOption[], id: string): string {
  return people.find((p) => p.id === id)?.full_name ?? id
}

export function PendingResolution({ pending, people, onResolved }: PendingResolutionProps) {
  const t = useT()
  const [resolving, setResolving] = useState(false)

  async function choose(personId: string) {
    setResolving(true)
    try {
      const taskId = await resolvePendingTask(pending.id, personId)
      onResolved?.(taskId)
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="pending-resolution">
      <h3 className="pending-resolution-title">{t('processes.pending.title')}</h3>
      {pending.reason === 'multiple' ? (
        <div role="group" aria-label={t('processes.pending.choose')} className="pending-resolution-candidates">
          {pending.candidate_person_ids.map((id) => (
            <button
              key={id}
              type="button"
              className="btn btn-outline"
              disabled={resolving}
              onClick={() => { void choose(id) }}
            >
              {personName(people, id)}
            </button>
          ))}
        </div>
      ) : (
        <PersonPicker
          people={people}
          onSelect={(id) => { void choose(id) }}
          onClose={() => {}}
        />
      )}
    </div>
  )
}
