import type { StreamItem } from '@/lib/home-stream'
import type { MessageKey } from '@/i18n/messages'

// The ONE region model. All three Home arrangements render these same regions — a layout chooses
// how to present them, never which of them exist (NFR-924 parity). A region with zero items is
// still returned, so an empty region is distinguishable from a hidden one (FR-929).

export type HomeRegionId = 'needs-you' | 'failed-checks' | 'mentions' | 'my-work'

export interface HomeRegion {
  id: HomeRegionId
  labelKey: MessageKey
  items: StreamItem[]
  count: number
}

export interface HomeRegionInput {
  overdue: StreamItem[]
  dueToday: StreamItem[]
  blocked: StreamItem[]
  myWork: StreamItem[]
  failedChecks: StreamItem[]
  mentions: StreamItem[]
}

export function buildHomeRegions(input: HomeRegionInput): HomeRegion[] {
  const needsYou = [...input.overdue, ...input.dueToday, ...input.blocked]
  const regions: Array<[HomeRegionId, MessageKey, StreamItem[]]> = [
    ['needs-you', 'home.region.needsYou', needsYou],
    ['failed-checks', 'home.stream.band.failedChecks', input.failedChecks],
    ['mentions', 'home.stream.band.mentions', input.mentions],
    ['my-work', 'home.stream.band.myWork', input.myWork],
  ]
  return regions.map(([id, labelKey, items]) => ({ id, labelKey, items, count: items.length }))
}
