// MyWeek — thin page wrapper around MyWeekPanel (Home v1, Task 4.1, ADR-0019 D2).
// The body (MyTasksCard + strips + TeamModule) was extracted to
// `@/components/weekly/my-week-panel.tsx` so Home can reuse it without a route change.
// This component survives as a directly-testable, directly-navigable page (My Week
// stays reachable — it is simply no longer the index route after the router swap).
import { useMemo } from 'react'
import { PageFrame } from '@/shell/page-frame'
import { PageHead } from '@/shell/page-head'
import { useDocumentTitle } from '@/shell/use-document-title'
import { weekLabel } from '@/lib/week'
import { MyWeekPanel } from '@/components/weekly/my-week-panel'

export function MyWeek() {
  useDocumentTitle('My Week — Gordi MOS')

  // Stable "now" snapshot — memoized so the subtitle doesn't recompute every render.
  const now = useMemo(() => new Date(), [])
  const wib = weekLabel(now)

  const subtitle = `Week of ${wib.range} · ${wib.today} · what needs you`

  return (
    <PageFrame surfaceWash>
      <PageHead title="My Week" subtitle={subtitle} />
      <MyWeekPanel />
    </PageFrame>
  )
}
