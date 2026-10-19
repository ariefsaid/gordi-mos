import type { HomeLayoutProps } from './home-layout-types'
import { HomeWorkbenchLayout } from './home-workbench-layout'

/** Focused keeps the ranked queue beside its standing context on wide Home. */
export function HomeFocused(props: HomeLayoutProps) {
  return <HomeWorkbenchLayout {...props} layout="focused" />
}
