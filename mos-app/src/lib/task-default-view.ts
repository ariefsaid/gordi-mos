export type TaskDefaultView = 'all' | 'my-work' | 'team-work'

export function getTaskDefaultView({
  accessRoles,
  hasReport,
}: {
  accessRoles: readonly string[]
  hasReport: boolean
}): TaskDefaultView {
  if (accessRoles.includes('admin')) return 'all'
  if (hasReport || accessRoles.some((role) => ['ops_lead', 'supervisor', 'manager'].includes(role))) {
    return 'team-work'
  }
  return 'my-work'
}
