import type { HomeLayoutProps } from './home-layout-types'
import { HomeWorkbenchLayout } from './home-workbench-layout'

/** Overview keeps urgent work full-width before the other-work/context split. */
export function HomeOverview(props: HomeLayoutProps) {
  return <HomeWorkbenchLayout {...props} layout="overview" />
}
