// NotFoundPage — the 404 surface.
//
// It names the path that failed and offers BOTH recoveries — a mistyped URL is usually ONE segment
// wrong, so "go back" keeps the user's position while "Home" is the dead-end fallback.
//
// ONE title. The surface used to carry two: the page head said "Page not found" and the EmptyState
// under it said "That page isn't here" — the same fact, twice, in two different wordings, on the
// one screen whose entire job is to say a single thing. The head now carries the sentence itself,
// the copy rides as its subtitle, and the EmptyState is gone; `doc.notFound` stays the browser tab
// title, where a short label is what a tab strip needs.
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { useSetBoundaryLabel } from '@/shell/breadcrumb-title'
import './not-found-page.css'

export function NotFoundPage() {
  const t = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useDocumentTitle(t('common.docTitle', { page: t('doc.notFound') }))
  // The top bar names this page too: an unknown path (or an unknown child of Work) has no destination of its own.
  useSetBoundaryLabel(t('notFound.title'))

  return (
    <PageFamilyFrame family="workspace" title={t('notFound.title')}>
      <div className="not-found-workbench">
        <p className="not-found-copy">{t('notFound.copy')}</p>
        <p className="not-found-path"><span>{t('notFound.requested')}</span><code>{pathname}</code></p>
        <div className="not-found-actions">
          <Link to="/" className="btn btn-primary">{t('notFound.home')}</Link>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>{t('notFound.back')}</button>
        </div>
      </div>
    </PageFamilyFrame>
  )
}
