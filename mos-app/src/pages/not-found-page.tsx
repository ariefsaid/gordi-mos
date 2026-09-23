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
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'

export function NotFoundPage() {
  const t = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useDocumentTitle(t('common.docTitle', { page: t('doc.notFound') }))

  return (
    <PageFrame>
      {/* DESIGN.md § Accessibility, "Heading levels (v4)": the page frame owns the page's only
          <h1>, and on this surface that h1 IS the message. */}
      <PageHead title={t('notFound.title')} subtitle={t('notFound.copy')} />
      <p className="text-muted-foreground" style={{ marginBottom: 16 }}>
        {pathname}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" className="btn btn-primary" onClick={() => navigate(-1)}>
          {t('notFound.back')}
        </button>
        <Link to="/" className="btn btn-outline">
          {t('notFound.home')}
        </Link>
      </div>
    </PageFrame>
  )
}
