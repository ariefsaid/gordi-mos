/** OD-WAY-94's role-aware initial Tasks scope. The selector is deliberately pure so the route,
 * saved-view engine, and rail aggregate can share the same decision without a UI-specific default.
 */
export type TaskDefaultView = 'all' | 'my-work' | 'team-work'

export function getTaskDefaultView(args: {
  accessRoles: readonly string[]
  /** Canonical org-position scope from role-scope.isOwnerDirector(viewer.roles). */
  isOwnerDirector?: boolean
  /** A report/downline relationship grants Team work even when the role label is custom. */
  hasReport: boolean
}): TaskDefaultView {
  if (args.isOwnerDirector || args.accessRoles.includes('admin')) return 'all'
  if (args.hasReport || args.accessRoles.some((role) => role === 'ops_lead' || role === 'supervisor' || role === 'manager')) {
    return 'team-work'
  }
  return 'my-work'
}
