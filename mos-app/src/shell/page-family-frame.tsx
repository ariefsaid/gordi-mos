import type { ReactNode } from 'react'
import {
  PAGE_FAMILY_CONTRACTS,
  type PageFamily,
  type PageFamilyState,
} from './page-families'
import { PageFrame } from './page-frame'
import { PageHead } from './page-head'

export interface PageFamilyFrameProps {
  family: PageFamily
  title: string
  subtitle?: string
  jobSentence: string
  count?: number | null
  meta?: ReactNode
  action?: ReactNode
  state?: PageFamilyState
  surfaceWash?: boolean
  /**
   * P1-2 (Luna-measured y≈234 vs E7's y≈124): opt-in — skip the shared PageHead entirely. For a
   * tenant whose own typed content already supplies the ONE page heading, the generic shell
   * PageHead (h1 type-label + jobSentence prose) is pure duplication above it, not a second
   * landmark anything relies on — ContextRow's "who owns the job sentence" suppression is keyed
   * off the ROUTE registry (page-family-migration.ts), not whether PageHead itself rendered, so
   * hiding it here never resurrects a duplicate ContextRow sentence. Defaults false so every other
   * PageFamilyFrame caller (workspace/management, and focused-record pages that still want the
   * generic head) is byte-for-byte unchanged. (This shared frame stays family-agnostic — no
   * specific tenant renderer named here — per the page-family migration guard.)
   */
  hideHead?: boolean
  children: ReactNode
}

export function PageFamilyFrame({
  family,
  title,
  subtitle,
  jobSentence,
  count,
  meta,
  action,
  state = 'default',
  surfaceWash,
  hideHead = false,
  children,
}: PageFamilyFrameProps) {
  const contract = PAGE_FAMILY_CONTRACTS[family]

  return (
    <PageFrame
      family={family}
      state={state}
      variant="data"
      surfaceWash={surfaceWash}
    >
      {!hideHead && (
        <PageHead
          family={family}
          variant={contract.headVariant}
          title={title}
          subtitle={subtitle}
          jobSentence={jobSentence}
          count={count}
          meta={meta}
          action={action}
        />
      )}
      {children}
    </PageFrame>
  )
}
