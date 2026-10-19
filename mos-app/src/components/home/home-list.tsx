import type { HomeLayoutProps } from './home-layout-types'
import { HomeWorkbenchLayout } from './home-workbench-layout'

/** List stacks the same ranked queue and standing sections in their shared reading order. */
export function HomeList(props: HomeLayoutProps) {
  return <HomeWorkbenchLayout {...props} layout="list" />
}
