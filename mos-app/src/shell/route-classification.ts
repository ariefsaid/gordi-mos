// Route classification — every entry in the route table declares what KIND of thing it is.
//
// Three kinds, and the set is closed:
//   • page           — a surface a viewer lands on, tagged with its page family (page-families.ts)
//   • redirect       — a retired path whose only job is to forward to its canonical replacement
//   • infrastructure — auth gates, the shell layout route, capability gates, the not-found
//                      catch-all, and DEV-only harnesses: routes with no surface of their own
//
// `assertRouteClassification` throws on any route that declares no handle, or declares a malformed
// one. Because it runs over the REAL `routeConfig` in a test, adding a route without classifying it
// fails the suite — which is what keeps the table enumerable for the routing ACs (AC-017…AC-021).
//
// Ported from `v4-redesign`. The v4 file named every export `v3*` (`v3Page`, `V3RouteHandle`,
// `collectV3Routes`) — a leftover from the v3 redesign line that had nothing to do with what the
// code does. Carrying a stale version number into the v4 port would credit the wrong thing, so the
// names describe the mechanism instead. Behaviour is unchanged.

import {  type PageFamily } from './page-families'

export type InfrastructureReason =
  | 'auth'
  | 'layout'
  | 'capability'
  | 'public'
  | 'dev-only'
  | 'not-found'

export type RouteHandle =
  | { kind: 'page'; family: PageFamily }
  | { kind: 'redirect'; target: string }
  | { kind: 'infrastructure'; reason: InfrastructureReason }

export function pageHandle(family: PageFamily): RouteHandle {
  return { kind: 'page', family }
}

export function redirectHandle(target: string): RouteHandle {
  return { kind: 'redirect', target }
}

export function infrastructureHandle(reason: InfrastructureReason): RouteHandle {
  return { kind: 'infrastructure', reason }
}
