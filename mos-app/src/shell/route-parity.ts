/**
 * Canonical static surfaces covered by PROOF-02.
 *
 * The router consumes these path segments and the browser proof consumes the catalog metadata.
 * The route census compares the catalog with the live, post-ship-gate route table so a surface
 * cannot be added to the router or removed from it without changing the proof's coverage.
 */
export const ROUTE_PATHS = {
  home: '/',
  workTasks: 'work/tasks',
  workSignals: 'work/signals',
  workProjects: 'work/projects',
  workObjectives: 'work/objectives',
  inbox: 'inbox',
  cafe: 'cafe',
  cafeLog: 'cafe/log',
  cafePlan: 'cafe/plan',
  cafeStock: 'cafe/stock',
  cafeReview: 'cafe/review',
  cafePushes: 'cafe/pushes',
  adminPeople: 'admin/people',
  adminAccess: 'admin/access',
  profile: 'profile',
} as const

type RouteParityKind = 'visible-root' | 'child' | 'utility'
type RouteParityOwner = 'breadcrumb' | 'admin-settings'
export type RouteParityId =
  | 'home'
  | 'workTasks'
  | 'workSignals'
  | 'workProjects'
  | 'workObjectives'
  | 'inbox'
  | 'cafe'
  | 'cafeLog'
  | 'cafePlan'
  | 'cafeStock'
  | 'cafeReview'
  | 'cafePushes'
  | 'adminPeople'
  | 'adminAccess'
  | 'profile'

export interface RouteParityEntry {
  id: RouteParityId
  path: string
  kind: RouteParityKind
  owner?: RouteParityOwner
}

function absolutePath(path: string): string {
  return path === '/' ? path : `/${path}`
}

export const ROUTE_PARITY_CATALOG: readonly RouteParityEntry[] = [
  { id: 'home', path: absolutePath(ROUTE_PATHS.home), kind: 'visible-root' },
  { id: 'workTasks', path: absolutePath(ROUTE_PATHS.workTasks), kind: 'visible-root' },
  { id: 'workSignals', path: absolutePath(ROUTE_PATHS.workSignals), kind: 'visible-root' },
  { id: 'workProjects', path: absolutePath(ROUTE_PATHS.workProjects), kind: 'visible-root' },
  { id: 'workObjectives', path: absolutePath(ROUTE_PATHS.workObjectives), kind: 'visible-root' },
  { id: 'inbox', path: absolutePath(ROUTE_PATHS.inbox), kind: 'visible-root' },
  { id: 'cafe', path: absolutePath(ROUTE_PATHS.cafe), kind: 'visible-root' },
  // cafeLog retired from the page catalog (DD-MVP-17): /cafe/log redirects to the capture
  // root at /cafe, which carries the surface itself.
  { id: 'cafePlan', path: absolutePath(ROUTE_PATHS.cafePlan), kind: 'child' },
  { id: 'cafeStock', path: absolutePath(ROUTE_PATHS.cafeStock), kind: 'child' },
  { id: 'cafeReview', path: absolutePath(ROUTE_PATHS.cafeReview), kind: 'child' },
  { id: 'cafePushes', path: absolutePath(ROUTE_PATHS.cafePushes), kind: 'child' },
  { id: 'adminPeople', path: absolutePath(ROUTE_PATHS.adminPeople), kind: 'visible-root' },
  { id: 'adminAccess', path: absolutePath(ROUTE_PATHS.adminAccess), kind: 'utility', owner: 'admin-settings' },
  { id: 'profile', path: absolutePath(ROUTE_PATHS.profile), kind: 'utility', owner: 'breadcrumb' },
]
