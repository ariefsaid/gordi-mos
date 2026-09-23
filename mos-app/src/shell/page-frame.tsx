import type { ReactNode } from 'react'
import type { PageFamily, PageFamilyState } from './page-families'
import './page-families.css'

export interface PageFrameProps {
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
  family?: PageFamily
  state?: PageFamilyState
}

/**
 * Standard page layout: full-height scrollable main area + max-width content container.
 * Each page route renders exactly one PageFrame (which owns the <main> landmark).
 * The `variant` prop controls whether content is capped at 1080px (prose) or runs full-bleed (data).
 */
export function PageFrame({
  children,
  variant = 'prose',
  surfaceWash = false,
  family,
  state = 'default',
}: PageFrameProps) {
  const isData = variant === 'data'
  const isV3 = family !== undefined
  const isBusy = state === 'loading' || state === 'saving'
  const className = `min-w-0 overflow-auto flex-1 min-h-0${isV3 ? ' page-frame--v3' : ''}`
  // CONV (layout consistency): every page LEFT-aligns at the same 24px gutter (content
  // origin identical across routes — no centered-prose vs left-data jump). Prose caps at
  // 1080px for comfortable reading/forms; data runs full-bleed (the workspace caps itself
  // at 1280 internally). Trailing whitespace sits on the RIGHT only — never centered.
  return (
    <main
      className={className}
      data-page-family={family}
      data-page-state={isV3 ? state : undefined}
      aria-busy={isBusy ? 'true' : undefined}
      style={isV3
        ? (surfaceWash ? { backgroundImage: 'var(--gradient-surface-wash)' } : undefined)
        : {
            padding: '28px 24px 56px',
            // OD-P3-12: faint navy wash sits behind the content; fades to transparent within 220px.
            ...(surfaceWash ? { backgroundImage: 'var(--gradient-surface-wash)' } : {}),
          }}
    >
      <div
        className={isV3 ? 'page-frame__content' : undefined}
        style={isV3 ? undefined : { maxWidth: isData ? 'none' : '1080px', margin: 0 }}
      >
        {children}
      </div>
    </main>
  )
}
