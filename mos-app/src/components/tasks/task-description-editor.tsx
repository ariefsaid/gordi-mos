import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import { BlockDocumentEditor, type BlockDocumentCopy } from '@/components/block-document/block-document-editor'
import { useCatalogRecordEntryFactory } from '@/components/catalog/use-catalog-record-overlay'
import { SignalRecordHost } from '@/components/signals/signal-record-host'
import { useOptionalOverlayHost, type OverlayEntry } from '@/shell/overlay-host'
import type { RecordRef } from '@/lib/db/document-references'
import { readTaskBody, saveTaskBody } from '@/lib/db/task-body'

// The Task description as a block document (mos.tasks.body): the shared editor with `@` mentions of
// people and Teams and `[[` links to records, whose chips open the record in the panel stack.

export interface TaskDescriptionEditorProps {
  taskId: string
  canEdit: boolean
  onDirtyChange?: (dirty: boolean) => void
}

const PAGE_PATH = {
  task: '/work/tasks/',
  objective: '/work/objectives/',
  project: '/work/projects/',
  signal: '/work/signals/',
} as const

export function TaskDescriptionEditor({ taskId, canEdit, onDirtyChange }: TaskDescriptionEditorProps) {
  const t = useT()
  const auth = useAuth()
  const navigate = useNavigate()
  const host = useOptionalOverlayHost()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  // A pushed record keeps the physical slot that is already showing the stack.
  const topOwner = host?.session?.frames.at(-1)?.entry.owner
  const { buildEntry } = useCatalogRecordEntryFactory({ owner: topOwner === 'work' || topOwner === 'signals' ? topOwner : 'tasks' })

  const openRecord = useCallback(({ kind, id }: RecordRef) => {
    if (!host?.session) { navigate(`${PAGE_PATH[kind]}${id}`); return }
    if (kind !== 'signal') { void host.push(buildEntry(kind === 'project' ? 'work-line' : kind, id)); return }
    const entry: OverlayEntry = {
      key: `signal:${id}`,
      owner: host.session.frames.at(-1)?.entry.owner ?? 'tasks',
      tenant: 'record',
      label: t('signals.record.title'),
      title: t('signals.record.title'),
      pageTo: { pathname: `${PAGE_PATH.signal}${id}` },
      content: <SignalRecordHost signalId={id} mode="panel" onPromote={(to, state) => { void host.openPage(to, state) }} />,
    }
    void host.push(entry)
  }, [buildEntry, host, navigate, t])

  const store = useMemo(() => ({
    read: () => readTaskBody(taskId),
    save: (blocks: unknown[], expectedUpdatedAt: string) => saveTaskBody(taskId, blocks, expectedUpdatedAt),
  }), [taskId])

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
    save: t('blockDoc.save'),
    saving: t('blockDoc.saving'),
    saved: t('blockDoc.saved'),
    unsaved: t('blockDoc.unsaved'),
    failed: t('blockDoc.failed'),
    retry: t('blockDoc.retry'),
    reload: t('blockDoc.reload'),
    conflict: t('blockDoc.conflict'),
    tooLarge: (limit) => t('blockDoc.tooLarge', { limit }),
    keysHint: t('blockDoc.keysHint'),
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
