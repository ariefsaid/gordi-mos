// The task create form as a frame on a record's panel stack. "Add task" from an Objective or a
// Project/Process pushes this instead of leaving for the Tasks create route; it prefills the
// Project/Process, leaves through the host's leave guard, and pops back to the record when saved.
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TaskSurface } from '@/components/tasks/task-surface'
import type { OverlayLeaveDecision } from '@/shell/overlay-navigation'
import type { CatalogTaskCreateSession } from './catalog-task-create-session'

export type CatalogTaskCreateFrameProps = {
  workLineId: string
  session: CatalogTaskCreateSession
  onCreated: (taskId: string) => void
  /** Leave without creating (Cancel): the host pops the frame after its leave guard allows it. */
  onLeave: () => void
}

export function CatalogTaskCreateFrame({ workLineId, session, onCreated, onLeave }: CatalogTaskCreateFrameProps) {
  const t = useT()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const resolverRef = useRef<((decision: OverlayLeaveDecision) => void) | null>(null)

  useEffect(() => {
    session.requestConfirmation = () => new Promise<OverlayLeaveDecision>((resolve) => {
      resolverRef.current = resolve
      setConfirmOpen(true)
    })
    return () => {
      session.requestConfirmation = undefined
      resolverRef.current?.({ decision: 'deny' })
      resolverRef.current = null
    }
  }, [session])

  const resolve = (decision: OverlayLeaveDecision) => {
    if (decision.decision === 'allow') session.dirty = false
    setConfirmOpen(false)
    resolverRef.current?.(decision)
    resolverRef.current = null
  }

  return (
    <>
      <TaskSurface
        taskId={null}
        mode="create"
        presentation="panel"
        width="drawer"
        showPanelUtility={false}
        createInitialValues={{ workLineId }}
        createRedirect={null}
        onTaskCreated={(taskId) => { session.dirty = false; onCreated(taskId) }}
        onDirtyChange={(dirty) => { session.dirty = dirty }}
        // The form's own Cancel goes back through the host, which asks the leave guard first.
        onRequestLeave={() => { onLeave() }}
      />
      <ConfirmDialog
        open={confirmOpen}
        title={t('tasks.unsaved.title')}
        body={t('tasks.unsaved.copy')}
        confirmLabel={t('tasks.unsaved.discard')}
        cancelLabel={t('tasks.cancel')}
        tone="destructive"
        onConfirm={async () => { resolve({ decision: 'allow' }) }}
        onCancel={() => { resolve({ decision: 'deny' }) }}
      />
    </>
  )
}
