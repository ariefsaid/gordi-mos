// Transfer routes — the pure view model over stored routes, stream Teams and the branch catalog.
// No IO, no writes. A route is one stored triple (origin branch,
// origin activity, destination branch); it is "Configured" when both ends still resolve and the pair
// is one MOS would offer, and "Needs attention" otherwise — never silently dropped.
import { branchDisplayName, streamKey } from '@/lib/kitchen-action-label'
import type { TransferRoute } from '@/lib/db/cafe-transfer-routes'
import type { BranchOption, CafeDestination, ProductionActivity, ProductionStream, StreamPair } from '@/lib/db/kitchen-logs.types'

export type RouteProblem = 'originUnknown' | 'originNotProducing' | 'destinationUnknown' | 'destinationNotEligible' | 'sameBranch' | 'noDestinationBar'
type RouteForView = CafeDestination & Partial<Pick<TransferRoute, 'row_version' | 'updated_at' | 'updated_by' | 'eligibility' | 'reason'>>

export interface RouteRow {
  /** Stable URL key: origin branch id, activity, destination branch id. */
  key: string
  originBranchId: string
  originActivity: ProductionActivity
  destinationBranchId: string
  /** Canonical branch name, or null when the branch could not be resolved (shown as a reason, never a guess). */
  originBranchName: string | null
  destinationName: string | null
  /** The destination as the floor reads it (alias, e.g. Bungur). */
  destinationAlias: string | null
  problem: RouteProblem | null
  rowVersion: number | null
  eligibility: 'eligible' | 'needs_attention'
  reason: string | null
}

export interface DerivedRow {
  key: string
  branchId: string
  branchName: string
}

export const routeKey = (route: CafeDestination) => `${route.origin_branch_id}:${route.origin_activity}:${route.destination_branch_id}`

/** Does `branch` have a bar stream Team? A cross-branch bar movement needs a destination bar stream. */
function hasBar(pairs: readonly StreamPair[], branchId: string) {
  return pairs.some((pair) => pair.branch_id === branchId && pair.activity === 'bar')
}

/** Branches a producing origin stream may send to (existing movementsForStream rule): another active branch; bar origins also need a destination bar stream. */
export function eligibleDestinations(
  origin: Pick<ProductionStream, 'branch' | 'activity'> | null,
  branches: readonly BranchOption[],
  pairs: readonly StreamPair[],
): BranchOption[] {
  if (!origin) return []
  return branches.filter((branch) =>
    branch.id !== origin.branch.id &&
    pairs.some((pair) => pair.branch_id === branch.id) &&
    (origin.activity === 'kitchen' || hasBar(pairs, branch.id)))
}

export interface RouteContext {
  activeBranches: readonly BranchOption[]
  /** Archived or other branches resolved by id, for historical routes. */
  extraBranches: readonly Pick<BranchOption, 'id' | 'name'>[]
  pairs: readonly StreamPair[]
}

export function buildRouteRows(destinations: readonly RouteForView[], ctx: RouteContext): RouteRow[] {
  const active = new Map(ctx.activeBranches.map((branch) => [branch.id, branch]))
  const names = new Map<string, string>([...ctx.extraBranches.map((b) => [b.id, b.name] as const), ...ctx.activeBranches.map((b) => [b.id, b.name] as const)])
  return destinations.map((route): RouteRow => {
    const origin = active.get(route.origin_branch_id)
    const destination = active.get(route.destination_branch_id)
    const pair = ctx.pairs.find((p) => p.branch_id === route.origin_branch_id && p.activity === route.origin_activity)
    let problem: RouteProblem | null = null
    if (route.origin_branch_id === route.destination_branch_id) problem = 'sameBranch'
    else if (!origin || !pair) problem = 'originUnknown'
    else if (pair.produces !== true) problem = 'originNotProducing'
    else if (!destination) problem = 'destinationUnknown'
    else if (route.origin_activity === 'bar' && !hasBar(ctx.pairs, destination.id)) problem = 'noDestinationBar'
    else if (!eligibleDestinations({ branch: origin, activity: route.origin_activity }, ctx.activeBranches, ctx.pairs)
      .some((branch) => branch.id === destination.id)) problem = 'destinationNotEligible'
    return {
      key: routeKey(route),
      originBranchId: route.origin_branch_id, originActivity: route.origin_activity, destinationBranchId: route.destination_branch_id,
      originBranchName: names.get(route.origin_branch_id) ?? null,
      destinationName: names.get(route.destination_branch_id) ?? null,
      destinationAlias: destination ? branchDisplayName(destination) : null,
      problem,
      rowVersion: typeof route.row_version === 'number' ? route.row_version : null,
      eligibility: route.eligibility ?? (problem ? 'needs_attention' : 'eligible'),
      reason: route.reason ?? null,
    }
  })
}

/** Same-branch bar → kitchen movements MOS derives from the streams (not configured routes). */
export function derivedMovements(pairs: readonly StreamPair[], branches: readonly BranchOption[]): DerivedRow[] {
  return branches
    .filter((branch) =>
      pairs.some((p) => p.branch_id === branch.id && p.activity === 'bar' && p.produces === true) &&
      pairs.some((p) => p.branch_id === branch.id && p.activity === 'kitchen'))
    .map((branch) => ({ key: branch.id, branchId: branch.id, branchName: branch.name }))
}

export interface RouteFilters {
  /** `all` or `<branch-id>:<activity>` */
  origin: string
  destination: string
  q: string
  sort: 'origin' | 'destination'
  dir: 'asc' | 'desc'
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const originLabel = (row: RouteRow) => `${row.originBranchName ?? '~'} ${row.originActivity}`
const destinationLabel = (row: RouteRow) => row.destinationName ?? '~'

export function applyRouteFilters(rows: readonly RouteRow[], f: RouteFilters, labels: (row: RouteRow) => string): RouteRow[] {
  const needle = f.q.trim().toLowerCase()
  const filtered = rows.filter((row) =>
    (f.origin === 'all' || streamKey(row.originBranchId, row.originActivity).replace('|', ':') === f.origin) &&
    (f.destination === 'all' || row.destinationBranchId === f.destination) &&
    (!needle || labels(row).toLowerCase().includes(needle)))
  const dir = f.dir === 'desc' ? -1 : 1
  const primary = f.sort === 'origin' ? originLabel : destinationLabel
  const secondary = f.sort === 'origin' ? destinationLabel : originLabel
  return [...filtered].sort((a, b) =>
    dir * collator.compare(primary(a), primary(b)) || collator.compare(secondary(a), secondary(b)) || collator.compare(a.key, b.key))
}

export function parseRouteFilters(params: URLSearchParams): RouteFilters {
  return {
    origin: params.get('origin') || 'all',
    destination: params.get('destination') || 'all',
    q: params.get('q') ?? '',
    sort: params.get('sort') === 'destination' ? 'destination' : 'origin',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  }
}
