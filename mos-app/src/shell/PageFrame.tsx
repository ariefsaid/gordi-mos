import type { ReactNode } from 'react'

interface PageFrameProps {
  children: ReactNode
  /**
   * 'prose' (default) — caps content at 1080px for readable line lengths (all pages except Tasks).
   * 'data'            — full-bleed (no max-width cap); used by the Tasks DB-view workspace (FR-120).
   */
  variant?: 'data' | 'prose'
}

/**
 * Standard page layout: full-height scrollable main area + max-width content container.
 * Each page route renders exactly one PageFrame (which owns the <main> landmark).
 * The `variant` prop controls whether content is capped at 1080px (prose) or runs full-bleed (data).
 */
export default function PageFrame({ children, variant = 'prose' }: PageFrameProps) {
  const isData = variant === 'data'
  return (
    <main className="overflow-auto" style={{ padding: isData ? '28px 24px 56px' : '28px 32px 56px' }}>
      <div style={{ maxWidth: isData ? 'none' : '1080px', margin: isData ? '0' : '0 auto' }}>
        {children}
      </div>
    </main>
  )
}
