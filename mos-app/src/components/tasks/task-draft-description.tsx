import { useMemo } from 'react'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { BlockDocumentEditor } from '@/components/block-document/block-document-editor'
import type { BlockDocument } from '@/lib/db/block-document'
import { taskDocumentCopy } from './task-document-copy'

// The description of a Task that is not created yet: the Task page's document (same menus), kept in
// memory by Create task. No save bar and no conflict check; Create task is the save.

export interface TaskDraftDescriptionProps {
  /** The document typed so far; null for a blank one. Read once when the editor mounts. */
  body: BlockDocument | null
  canEdit: boolean
  onChange: (blocks: BlockDocument) => void
}

export function TaskDraftDescription({ body, canEdit, onChange }: TaskDraftDescriptionProps) {
  const t = useT()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const store = useMemo(() => ({
    read: async () => ({ blocks: body, updatedAt: '' }),
    save: async () => '',
  // The seed is read at mount; later edits live in the editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])
  const copy = { ...taskDocumentCopy(t), keysHint: t('blockDoc.keysHintDraft') }
  return (
    <BlockDocumentEditor
      documentKey="task-draft"
      store={store}
      canEdit={canEdit}
      draft
      mentions
      recordLinks
      checklistNote
      bare
      viewerId={viewerId}
      copy={copy}
      onDocumentChange={onChange}
    />
  )
}
