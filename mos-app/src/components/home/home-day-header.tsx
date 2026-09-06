import { useT } from '@/i18n/use-t'
import '@/pages/home-page.css'

// The day header's tally (`N left` / `N handled · N left`) — the header's right-aligned half
// (DESIGN.md § Components → Home arrangements → "Home day header"). `done` is rendered only when
// a real handled source supplies it; today none exists (ruling #6), so the figure is absent
// rather than invented. `null` tally — a read behind the sum has not succeeded — renders NOTHING:
// absent, not zero, not a dash standing in for one (DIV-G5).
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
