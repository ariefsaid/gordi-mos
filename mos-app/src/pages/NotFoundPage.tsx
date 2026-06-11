import { Link } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Page not found — Gordi MOS')

  return (
    <PageFrame>
      <h1
        className="font-bold text-foreground"
        style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 16 }}
      >
        Page not found.
      </h1>
      <Link to="/" className="text-primary no-underline font-semibold" style={{ fontSize: 14 }}>
        Back to My Week
      </Link>
    </PageFrame>
  )
}
