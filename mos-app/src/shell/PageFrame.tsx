import type { ReactNode } from 'react'

interface PageFrameProps {
  children: ReactNode
}

/**
 * Standard page layout: full-height scrollable main area + max-width content container.
 * Each page route renders exactly one PageFrame (which owns the <main> landmark).
 */
export default function PageFrame({ children }: PageFrameProps) {
  return (
    <main className="overflow-auto" style={{ padding: '28px 32px 56px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {children}
      </div>
    </main>
  )
}
