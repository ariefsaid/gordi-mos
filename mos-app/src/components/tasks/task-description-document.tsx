import { lazy, Suspense } from 'react'
import { useT } from '@/i18n/use-t'
import { LoadingShell } from '@/components/ui/state-kit'
import type { TaskDescriptionEditorProps } from './task-description-editor'

// The Task page's description section body. The editor loads on demand, which also keeps the
// panel-stack code it opens records with out of this module's import graph.
const TaskDescriptionEditor = lazy(() => import('./task-description-editor').then((m) => ({ default: m.TaskDescriptionEditor })))

export function TaskDescriptionDocument(props: TaskDescriptionEditorProps) {
  const t = useT()
  return (
    <Suspense fallback={<LoadingShell label={t('tasks.document.loading')} />}>
      <TaskDescriptionEditor {...props} />
    </Suspense>
  )
}
