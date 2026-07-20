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
  jobSentence: string
  count?: number | null
  meta?: ReactNode
  action?: ReactNode
  state?: PageFamilyState
  surfaceWash?: boolean
  children: ReactNode
}

export function PageFamilyFrame({
  family,
  title,
  jobSentence,
  count,
  meta,
  action,
  state = 'default',
  surfaceWash,
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
      <PageHead
        family={family}
        variant={contract.headVariant}
        title={title}
        jobSentence={jobSentence}
        count={count}
        meta={meta}
        action={action}
      />
      {children}
    </PageFrame>
  )
}
