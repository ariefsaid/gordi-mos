export type ViewerAffiliation = { affiliated: string[]; accessRoles: string[] }

export function canCaptureCafe(viewer: ViewerAffiliation): boolean {
  // Fail closed: an absent `affiliated` (stale pre-#744 session payload) defaults to [] —
  // unaffiliated, never the old permissive read.
  return (viewer.affiliated ?? []).includes('cafe') || viewer.accessRoles.some((role) => role === 'ops_lead' || role === 'admin')
}
