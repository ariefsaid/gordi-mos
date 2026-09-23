import type { ReactNode } from 'react'
import type { HomeRegion } from './home-regions'

/** Shared contract for the three v4 arrangements. The data model stays identical; only shape changes. */
export interface HomeLayoutProps {
  regions: HomeRegion[]
  feed: ReactNode
  /** Persona-specific opening content, such as the member Café door. */
  leading?: ReactNode
}
