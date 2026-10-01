import { useT } from '@/i18n/use-t'
import '@/pages/home-page.css'

// The day header's figure (`N open` / `N handled · N open`) — the header's right-aligned half
// (DESIGN.md § Components → Home arrangements → "Home day header"). `left` is Home's "N open":
// the ONE shared open-task count the rail badge reads (DD-COUNT-1, #1194). `done` is rendered
// only when a real handled source supplies it; today none exists (ruling #6), so the figure is
// absent rather than invented. `null` tally — the shared count has not resolved — renders
// NOTHING: absent, not zero, not a dash standing in for one (DIV-G5).
export type HomeDayTally = {
  left: number
  done?: number
}

export function HomeHeadCounts({ tally }: { tally: HomeDayTally | null }) {
  const t = useT()
  if (!tally) return null
  return (
    <span className="home-head-counts tabular-nums">
      {tally.done == null
        ? t('home.day.left', { left: tally.left })
        : t('home.day.counts', { done: tally.done, left: tally.left })}
    </span>
  )
}
