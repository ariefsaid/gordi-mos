import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/ui/state-kit'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBreadcrumbTitle } from '@/shell/breadcrumb-title'
import './cafe-count-page.css'

/** The Receipt issues destination is registered here; its list arrives with matching (posting stays off). */
export function CafeReceiptIssuesPage() {
  const t = useT()
  const title = t('cafe.receipts.issues.title')
  useSetBreadcrumbTitle(title)
  useDocumentTitle(t('common.docTitle', { page: `${title} · ${t('nav.cafe')}` }))
  return (
    <PageFamilyFrame family="workspace" title={title} headClassName="cafe-count__head">
      <div className="cafe-count">
        <EmptyState variant="blank" title={t('cafe.receipts.issues.empty.title')} copy={t('cafe.receipts.issues.empty.copy')}>
          <Link to="/cafe/receive" className="btn btn-outline btn-touch">{t('nav.cafe.receive')}</Link>
        </EmptyState>
      </div>
    </PageFamilyFrame>
  )
}
