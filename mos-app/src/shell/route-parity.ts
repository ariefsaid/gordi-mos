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
  cafeProduction: 'cafe/production',
  cafeTransfer: 'cafe/transfer',
  cafeWaste: 'cafe/waste',
  cafePlan: 'cafe/plan',
  cafeStock: 'cafe/stock',
  cafeItems: 'cafe/items',
  cafeReview: 'cafe/review',
  cafePushes: 'cafe/pushes',
  adminPeople: 'admin/people',
  adminTeams: 'admin/teams',
  adminAccess: 'admin/access',
  adminAgents: 'admin/agents',
  profile: 'profile',
  oauthConsent: 'oauth/consent',
  profileConnectedAgents: 'profile/connected-agents',
} as const

type RouteParityKind = 'visible-root' | 'child' | 'utility'
type RouteParityOwner = 'breadcrumb' | 'admin-settings' | 'agent-consent'
export type RouteParityId =
  | 'home'
  | 'workTasks'
  | 'workSignals'
  | 'workProjects'
  | 'workObjectives'
  | 'inbox'
  | 'cafe'
  | 'cafeProduction'
  | 'cafeTransfer'
  | 'cafeWaste'
  | 'cafePlan'
  | 'cafeStock'
  | 'cafeItems'
  | 'cafeReview'
  | 'cafePushes'
  | 'adminPeople'
  | 'adminTeams'
  | 'adminAccess'
  | 'adminAgents'
  | 'profile'
  | 'oauthConsent'
  | 'profileConnectedAgents'

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
  // cafeLog is a legacy redirect; production and transfer are the canonical capture routes.
  { id: 'cafeProduction', path: absolutePath(ROUTE_PATHS.cafeProduction), kind: 'child' },
  { id: 'cafeTransfer', path: absolutePath(ROUTE_PATHS.cafeTransfer), kind: 'child' },
  { id: 'cafeWaste', path: absolutePath(ROUTE_PATHS.cafeWaste), kind: 'child' },
  { id: 'cafePlan', path: absolutePath(ROUTE_PATHS.cafePlan), kind: 'child' },
  { id: 'cafeStock', path: absolutePath(ROUTE_PATHS.cafeStock), kind: 'child' },
  { id: 'cafeItems', path: absolutePath(ROUTE_PATHS.cafeItems), kind: 'child' },
  { id: 'cafeReview', path: absolutePath(ROUTE_PATHS.cafeReview), kind: 'child' },
  { id: 'cafePushes', path: absolutePath(ROUTE_PATHS.cafePushes), kind: 'child' },
  { id: 'adminPeople', path: absolutePath(ROUTE_PATHS.adminPeople), kind: 'visible-root' },
  { id: 'adminTeams', path: absolutePath(ROUTE_PATHS.adminTeams), kind: 'utility', owner: 'admin-settings' },
  { id: 'adminAccess', path: absolutePath(ROUTE_PATHS.adminAccess), kind: 'utility', owner: 'admin-settings' },
  { id: 'adminAgents', path: absolutePath(ROUTE_PATHS.adminAgents), kind: 'utility', owner: 'admin-settings' },
  { id: 'profile', path: absolutePath(ROUTE_PATHS.profile), kind: 'utility', owner: 'breadcrumb' },
  // Reached only from the sign-in service's redirect, never from navigation.
  { id: 'oauthConsent', path: absolutePath(ROUTE_PATHS.oauthConsent), kind: 'utility', owner: 'agent-consent' },
  { id: 'profileConnectedAgents', path: absolutePath(ROUTE_PATHS.profileConnectedAgents), kind: 'utility', owner: 'breadcrumb' },
]
