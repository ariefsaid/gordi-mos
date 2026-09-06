export type ViewerAffiliation = { affiliated?: string[]; accessRoles: string[] }

export function canCaptureCafe(viewer: ViewerAffiliation): boolean {
  // Older embedded viewers do not carry the new payload field; preserve their existing
  // capture behavior until the session has been refreshed.
  if (viewer.affiliated === undefined) return true
  return viewer.affiliated.includes('cafe') || viewer.accessRoles.some((role) => role === 'ops_lead' || role === 'admin')
}
