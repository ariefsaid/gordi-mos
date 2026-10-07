import { CafeReceiptIssuesQueue } from '@/components/kitchen/cafe-receipt-issues-queue'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import '@/components/kitchen/cafe-capture-layout.css'

/** Procurement's org-wide Receipt issues list; receivers get only their own issues, read-only, through RLS. */
export function CafeReceiptIssuesPage() {
  const t = useT()
  const title = t('cafe.receipts.issues.title')
  useSetBreadcrumbTitle(title)
  useDocumentTitle(t('common.docTitle', { page: `${title} · ${t('nav.cafe')}` }))
  return (
    <PageFamilyFrame family="workspace" title={title} headClassName="cafe-count__head">
      <div className="cafe-capture-review-page">
        <CafeReceiptIssuesQueue />
      </div>
    </PageFamilyFrame>
  )
}
