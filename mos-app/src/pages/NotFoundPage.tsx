import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../shell/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Page not found — Gordi MOS')

  return (
    <main className="overflow-auto" style={{ padding: '28px 32px 56px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <h1
          className="font-bold text-foreground"
          style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 16 }}
        >
          Page not found.
        </h1>
        <Link to="/" className="text-primary no-underline font-semibold" style={{ fontSize: 14 }}>
          Back to My Week
        </Link>
      </div>
    </main>
  )
}
