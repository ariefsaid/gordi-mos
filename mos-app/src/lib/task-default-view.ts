/** OD-WAY-94's role-aware initial Tasks scope. The selector is deliberately pure so the route,
 * saved-view engine, and rail aggregate can share the same decision without a UI-specific default.
 */
import { canViewTeamTasks, hasAccessRole } from './capabilities'

export type TaskDefaultView = 'all' | 'my-work' | 'team-work'

export function getTaskDefaultView(args: {
  accessRoles: readonly string[]
  /** Canonical org-position scope from role-scope.isOwnerDirector(viewer.roles). */
  isOwnerDirector?: boolean
  /** A report/downline relationship grants Team work even when the role label is custom. */
  hasReport: boolean
}): TaskDefaultView {
  if (args.isOwnerDirector || hasAccessRole(args.accessRoles, 'admin')) return 'all'
  if (args.hasReport || canViewTeamTasks(args.accessRoles)) {
    return 'team-work'
  }
  return 'my-work'
}
