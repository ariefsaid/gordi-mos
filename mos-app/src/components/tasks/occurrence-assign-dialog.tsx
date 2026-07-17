import { useT } from '@/i18n/use-t'
import { ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { PendingResolution } from '@/components/processes/pending-resolution'
import type { PendingTaskRow } from '@/lib/db/processes.types'
import type { PersonOption } from '@/lib/db/directory'
import './occurrence-assign-dialog.css'

// OccurrenceAssignDialog (Step 6 / ADR-0051, C2). The host TasksWorkspace mounts this when the
// occurrence group header's "N to assign" affordance (group-header-row.tsx) is clicked — it lists
// every unresolved process_run_pending_tasks row for that occurrence, each rendered via the
// existing PendingResolution surface (B7, Rule 11 — never a second resolution UI). Mirrors the
// hand-rolled role="dialog" overlay idiom (confirm-archive.tsx) rather than a new modal primitive.

export interface OccurrenceAssignDialogProps {
  pending: PendingTaskRow[]
  /** Full org roster — resolves candidate ids to names / backs the vacant-path full picker. */
  people: PersonOption[]
  loading: boolean
  error: boolean
  onRetry: () => void
  /** Bubbled from each PendingResolution's onResolved, tagged with which pending row resolved. */
  onResolved: (taskId: string, pendingId: string) => void
  onClose: () => void
}

export function OccurrenceAssignDialog({
  pending, people, loading, error, onRetry, onResolved, onClose,
}: OccurrenceAssignDialogProps) {
  const t = useT()
  return (
    <div role="dialog" aria-modal="true" aria-label={t('processes.pending.title')} className="occ-assign-overlay">
      <div className="occ-assign-box">
        <div className="occ-assign-head">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('processes.pending.close')}
          </button>
        </div>
        {loading && (
          <div aria-busy="true">
            <span className="sr-only" role="status">{t('tasks.loading')}</span>
            <SkeletonRows count={2} />
          </div>
        )}
        {!loading && error && <ErrorState message={t('tasks.error.load')} onRetry={onRetry} />}
        {!loading && !error && pending.length === 0 && (
          <p className="occ-assign-empty">{t('processes.pending.empty')}</p>
        )}
        {!loading && !error && pending.length > 0 && (
          <div className="occ-assign-list">
            {pending.map((p) => (
              <PendingResolution
                key={p.id}
                pending={p}
                people={people}
                onResolved={(taskId) => onResolved(taskId, p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
