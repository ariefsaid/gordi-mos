// Who may open Stock comparison. It reuses the app's existing Count-review authority and widens nothing:
// ops_lead and admin review every stream; a stream supervisor reviews her own Teams (the Review page's same
// `myStreamKeys`); everyone else has no entry and a deep link shows the no-access state.
import { useAuth } from '@/auth/use-auth'
import { isShipGated } from '@/lib/ship-gate'
import { streamKey } from '@/lib/kitchen-action-label'
import { canPushCafe, canReviewCafe } from '@/lib/kitchen-gates'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'
import { STOCK_COMPARISON_PATH, stockComparisonHref } from '@/lib/cafe-stock-comparison-url'

export interface ComparisonAudience {
  /** The viewer holds a Count-review role. */
  admitted: boolean
  /** ops_lead / admin: every stream. */
  all: boolean
}

export function audienceOf(accessRoles: readonly string[]): ComparisonAudience {
  const all = canPushCafe(accessRoles)
  return { admitted: canReviewCafe(accessRoles), all }
}

/** May this viewer compare this one stream? */
export function mayCompareStream(audience: ComparisonAudience, myStreamKeys: ReadonlySet<string>, stream: ProductionStream): boolean {
  return audience.admitted && (audience.all || myStreamKeys.has(streamKey(stream.branch.id, stream.activity)))
}

/** The streams the viewer may compare, in catalogue order. */
export function comparableStreams(audience: ComparisonAudience, myStreamKeys: ReadonlySet<string>, options: readonly ProductionStream[]): ProductionStream[] {
  return options.filter((option) => mayCompareStream(audience, myStreamKeys, option))
}

/** Is the route released for this build profile? The same ship authority as the route and menu entry. */
const useStockComparisonReleased = () => !isShipGated(STOCK_COMPARISON_PATH)

/**
 * The "View stock comparison" link under Count scope and Available to transfer: present only when released,
 * for a viewer the comparison admits for THIS stream; otherwise undefined and the page is exactly what it was.
 */
export function useStockComparisonLink(stream: ProductionStream | null, myStreamKeys: ReadonlySet<string>): string | undefined {
  const auth = useAuth()
  const released = useStockComparisonReleased()
  if (!released || !stream || auth.status !== 'authenticated') return undefined
  const audience = audienceOf(auth.viewer.accessRoles)
  if (!mayCompareStream(audience, myStreamKeys, stream)) return undefined
  return stockComparisonHref({ stream: { branchId: stream.branch.id, activity: stream.activity } })
}
