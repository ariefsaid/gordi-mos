import type { useT } from '@/i18n/use-t'
import type { BlockDocumentCopy } from './block-document-editor'

/** The save bar and key hint every block document shares; the document's own label and empty lines come from its page. */
export function sharedBlockDocumentCopy(t: ReturnType<typeof useT>): Pick<
  BlockDocumentCopy, 'save' | 'saving' | 'saved' | 'unsaved' | 'failed' | 'retry' | 'reload' | 'conflict' | 'tooLarge' | 'keysHint'
> {
  return {
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
}
