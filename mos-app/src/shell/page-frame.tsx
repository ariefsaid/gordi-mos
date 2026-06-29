import type { ReactNode } from 'react'

interface PageFrameProps {
  children: ReactNode
  /**
   * 'prose' (default) — caps content at 1080px for readable line lengths (all pages except Tasks).
   * 'data'            — full-bleed (no max-width cap); used by the Tasks DB-view workspace (FR-120).
   */
  variant?: 'data' | 'prose'
  /**
   * OD-P3-12 — faint navy surface wash for home/digest surfaces ONLY (My Week).
   * Applies `--gradient-surface-wash` as a background-image on the <main> area; the
   * wash fades from brand-navy at 3.5% alpha to transparent within 220px.
   * Never use on list/detail/tasks/ops surfaces (Restrained-Gradient Rule).
   */
  surfaceWash?: boolean
}

/**
 * Standard page layout: full-height scrollable main area + max-width content container.
 * Each page route renders exactly one PageFrame (which owns the <main> landmark).
 * The `variant` prop controls whether content is capped at 1080px (prose) or runs full-bleed (data).
 */
export function PageFrame({ children, variant = 'prose', surfaceWash = false }: PageFrameProps) {
  const isData = variant === 'data'
  // CONV (layout consistency): every page LEFT-aligns at the same 24px gutter (content
  // origin identical across routes — no centered-prose vs left-data jump). Prose caps at
  // 1080px for comfortable reading/forms; data runs full-bleed (the workspace caps itself
  // at 1280 internally). Trailing whitespace sits on the RIGHT only — never centered.
  return (
    <main
      className="min-w-0 overflow-auto flex-1 min-h-0"
      style={{
        padding: '28px 24px 56px',
        // OD-P3-12: faint navy wash sits behind the content; fades to transparent within 220px.
        ...(surfaceWash ? { backgroundImage: 'var(--gradient-surface-wash)' } : {}),
      }}
    >
      <div style={{ maxWidth: isData ? 'none' : '1080px', margin: 0 }}>
        {children}
      </div>
    </main>
  )
}
