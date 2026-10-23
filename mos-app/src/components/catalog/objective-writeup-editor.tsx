import { useMemo } from 'react'
import { useT } from '@/i18n/use-t'
import { readWriteUp, saveWriteUp } from '@/lib/db/objective-writeup'
import { BlockDocumentEditor, type BlockDocumentCopy } from '@/components/block-document/block-document-editor'

// The Objective write-up: the shared block-document editor with text blocks only, reading and saving
// mos.objectives.write_up. No mentions and no record links.

export interface ObjectiveWriteupEditorProps {
  objectiveId: string
  canEdit: boolean
  archived: boolean
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: () => void
}

export function ObjectiveWriteupEditor({ objectiveId, canEdit, archived, onDirtyChange, onSaved }: ObjectiveWriteupEditorProps) {
  const t = useT()
  const store = useMemo(() => ({
    read: async () => {
      const row = await readWriteUp(objectiveId)
      return row ? { blocks: row.writeUp, updatedAt: row.updatedAt } : null
    },
    save: (blocks: unknown[], expectedUpdatedAt: string) => saveWriteUp(objectiveId, blocks, expectedUpdatedAt),
  }), [objectiveId])
  const copy: BlockDocumentCopy = {
    label: t('objective.writeUp.label'),
    loading: t('objective.writeUp.loading'),
    loadError: t('objective.writeUp.loadError'),
    unreadable: t('objective.writeUp.unreadable'),
    empty: t('objective.writeUp.empty'),
    placeholder: t('objective.writeUp.placeholder'),
    placeholderEmpty: t('objective.writeUp.placeholderEmpty'),
    readOnly: t('objective.writeUp.readOnly'),
    save: t('objective.writeUp.save'),
    saving: t('objective.writeUp.saving'),
    saved: t('objective.writeUp.saved'),
    unsaved: t('objective.writeUp.unsaved'),
    failed: t('objective.writeUp.failed'),
    retry: t('objective.writeUp.retry'),
    reload: t('objective.writeUp.reload'),
    conflict: t('objective.writeUp.conflict'),
    tooLarge: (limit) => t('objective.writeUp.tooLarge', { limit }),
    keysHint: t('objective.writeUp.keysHint'),
  }
  return (
    <BlockDocumentEditor
      documentKey={objectiveId}
      store={store}
      canEdit={canEdit && !archived}
      copy={copy}
      onDirtyChange={onDirtyChange}
      onSaved={onSaved}
    />
  )
}
