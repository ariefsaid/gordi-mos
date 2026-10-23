import { useMemo } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { BlockDocumentEditor, type BlockDocumentCopy } from '@/components/block-document/block-document-editor'
import { sharedBlockDocumentCopy } from '@/components/block-document/block-document-copy'
import { useOpenDocumentRecord } from '@/components/block-document/use-open-document-record'
import { readTaskBody, saveTaskBody } from '@/lib/db/task-body'

// The Task description as a block document (mos.tasks.body): the shared editor with `@` mentions of
// people and Teams and `[[` links to records, whose chips open the record in the panel stack.

export interface TaskDescriptionEditorProps {
  taskId: string
  canEdit: boolean
  onDirtyChange?: (dirty: boolean) => void
}

export function TaskDescriptionEditor({ taskId, canEdit, onDirtyChange }: TaskDescriptionEditorProps) {
  const t = useT()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const openRecord = useOpenDocumentRecord('tasks')

  const store = useMemo(() => ({
    read: () => readTaskBody(taskId),
    save: (blocks: unknown[], expectedUpdatedAt: string) => saveTaskBody(taskId, blocks, expectedUpdatedAt, viewerId),
  }), [taskId, viewerId])

  const copy: BlockDocumentCopy = {
    label: t('tasks.document.label'),
    loading: t('tasks.document.loading'),
    loadError: t('tasks.document.loadError'),
    unreadable: t('tasks.document.unreadable'),
    empty: t('tasks.document.empty'),
    placeholder: t('tasks.document.placeholder'),
    placeholderEmpty: t('tasks.document.placeholderEmpty'),
    // The Task page already says it is view-only.
    readOnly: '',
    ...sharedBlockDocumentCopy(t),
  }

  return (
    <BlockDocumentEditor
      documentKey={taskId}
      store={store}
      canEdit={canEdit}
      mentions
      recordLinks
      checklistNote
      bare
      viewerId={viewerId}
      onOpenRecord={openRecord}
      copy={copy}
      onDirtyChange={onDirtyChange}
    />
  )
}
