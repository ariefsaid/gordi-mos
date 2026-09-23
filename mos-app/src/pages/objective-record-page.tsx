import { useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RecordPageChrome } from '@/shell/record-page-chrome'
import { useDocumentTitle } from '@/shell/use-document-title'
import { CatalogRecordDocument } from '@/components/catalog/catalog-record-document'

/** Canonical Objective record page. It shares the document renderer and the source-aware record
 * chrome used by the panel, so a phone/direct route never lands on an unimplemented placeholder. */
export function ObjectiveRecordPage() {
  const t = useT()
  const { objectiveId } = useParams<{ objectiveId: string }>()
  const location = useLocation()
  const [title, setTitle] = useState<string | null>(null)
  useDocumentTitle(t('common.docTitle', {
    page: title ? `${title} · ${t('nav.work.objectives')}` : t('nav.work.objectives'),
  }))

  if (!objectiveId) return <Navigate to="/work/objectives" replace />

  return (
    <PageFamilyFrame family="focused-record" title={t('nav.work.objectives')} hideHead>
      <RecordPageChrome
        backTo={{ pathname: '/work/objectives', search: location.search }}
        backLabel={t('nav.work.objectives')}
      />
      <CatalogRecordDocument
        kind="objective"
        id={objectiveId}
        mode="page"
        onTitleResolved={setTitle}
      />
    </PageFamilyFrame>
  )
}
