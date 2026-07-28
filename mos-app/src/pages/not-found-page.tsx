// NotFoundPage — the 404 surface.
//
// harden (2026-07-28): this was an untranslated bare `<h1>Page not found.</h1>` plus a single
// "Back to Home" link, in a shape that matched nothing else in the app. Two defects, both H9
// (error recovery, 2.17/4 app-wide):
//   1. A dead end wearing a link. A mistyped or stale URL is most often ONE segment wrong, so the
//      only useful recovery — going back to where you actually were — was the one route not
//      offered. "Home" throws away the user's position in the app.
//   2. It bypassed the shared state kit, so the app's most likely first-contact-with-failure
//      screen was the one screen that did not look like the app.
// Now: the shared EmptyState `blank` grammar (empty BY DESIGN — there is no source and nothing
// pending, so neither ✓ nor ↻ would be honest), fully localized, and it names the path that
// failed so the user can see WHICH link was wrong rather than guessing.
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
