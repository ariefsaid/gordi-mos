import type { ReactNode } from 'react'
import type { HomeRegion } from './home-regions'

/** Shared data projection and role-gated context for the three Home arrangements. */
export interface HomeLayoutProps {
  regions: HomeRegion[]
  cafeDoor?: ReactNode
  objectives?: ReactNode
  feed?: ReactNode
}
