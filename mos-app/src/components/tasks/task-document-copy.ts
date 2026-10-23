import type { BlockDocumentCopy } from '@/components/block-document/block-document-editor'
import { sharedBlockDocumentCopy } from '@/components/block-document/block-document-copy'
import type { useT } from '@/i18n/use-t'

/** The words of the Task description document, shared by the Task page and Create task. */
export function taskDocumentCopy(t: ReturnType<typeof useT>): BlockDocumentCopy {
  return {
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
}
