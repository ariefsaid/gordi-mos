// NotFoundPage — the 404 surface.
//
// #400 (ported from v4): fully localized, names the path that failed, and offers BOTH
// recoveries — a mistyped URL is usually ONE segment wrong, so "go back" keeps the user's
// position while "Home" is the dead-end fallback. The shared EmptyState `blank` grammar:
// empty BY DESIGN (no source, nothing pending — neither ✓ nor ↻ would be honest).
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/use-t'
import { PageFrame } from '@/shell/page-frame'
import { useDocumentTitle } from '@/shell/use-document-title'
import { EmptyState } from '@/components/ui/state-kit'

export function NotFoundPage() {
  const t = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useDocumentTitle(t('common.docTitle', { page: t('doc.notFound') }))

  return (
    <PageFrame>
      <EmptyState
        variant="blank"
        headingLevel={2}
        title={t('notFound.title')}
        copy={t('notFound.copy')}
        note={pathname}
      >
        <button type="button" className="btn btn-primary" onClick={() => navigate(-1)}>
          {t('notFound.back')}
        </button>
        <Link to="/" className="btn btn-outline">
          {t('notFound.home')}
        </Link>
      </EmptyState>
    </PageFrame>
  )
}
