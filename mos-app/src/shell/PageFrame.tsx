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
  // CONV (layout consistency): every page LEFT-aligns at the same 24px gutter (content
  // origin identical across routes — no centered-prose vs left-data jump). Prose caps at
  // 1080px for comfortable reading/forms; data runs full-bleed (the workspace caps itself
  // at 1280 internally). Trailing whitespace sits on the RIGHT only — never centered.
  return (
    <main className="overflow-auto" style={{ padding: '28px 24px 56px' }}>
      <div style={{ maxWidth: isData ? 'none' : '1080px', margin: 0 }}>
        {children}
      </div>
    </main>
  )
}
