import { useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { RecordPageChrome } from '@/shell/record-page-chrome'
import { useDocumentTitle } from '@/shell/use-document-title'
import { CatalogRecordDocument } from '@/components/catalog/catalog-record-document'

/** Canonical Project/Process record page. The collection may promote the same document into a
 * panel; this route is the direct-load/new-tab/full-page door for that record. */
export function WorkLineRecordPage() {
  const t = useT()
  const { workLineId } = useParams<{ workLineId: string }>()
  const location = useLocation()
  const [title, setTitle] = useState<string | null>(null)
  useDocumentTitle(t('common.docTitle', {
    page: title ? `${title} · ${t('nav.work.projects')}` : t('nav.work.projects'),
  }))

  if (!workLineId) return <Navigate to="/work/projects" replace />

  return (
    <PageFamilyFrame family="focused-record" title={t('nav.work.projects')} hideHead>
      <RecordPageChrome
        backTo={{ pathname: '/work/projects', search: location.search }}
        backLabel={t('nav.work.projects')}
      />
      <CatalogRecordDocument
        kind="work-line"
        id={workLineId}
        mode="page"
        onTitleResolved={setTitle}
      />
    </PageFamilyFrame>
  )
}
