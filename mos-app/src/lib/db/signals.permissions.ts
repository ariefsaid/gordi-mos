export type SignalPermissionViewer = {
  personId: string
  accessRoles: readonly string[]
  teamIds: readonly string[]
  businessUnitIds: readonly string[]
  capabilities?: readonly string[]
}

export type SignalPermissionTarget = { id: string; businessUnitId: string }

export type SignalRetractTarget = {
  authorId: string
  owningTeamId: string
  leadTeamIds: readonly string[]
}

export function canRetract(viewer: SignalPermissionViewer, target: SignalRetractTarget): boolean {
  const canRetractCapability = viewer.capabilities?.includes('signal.retract')
    || viewer.accessRoles.some((role) => ['ops_lead', 'finance', 'admin'].includes(role))
  return viewer.personId === target.authorId || target.leadTeamIds.includes(target.owningTeamId) || !!canRetractCapability
}

export function canPostTo(viewer: SignalPermissionViewer, target: SignalPermissionTarget): boolean {
  const canCreateForTeam = viewer.capabilities?.includes('signal.create_for_team')
    || viewer.accessRoles.some((role) => ['ops_lead', 'admin'].includes(role))
  return viewer.teamIds.includes(target.id)
    || !!canCreateForTeam
    || (['ops_lead', 'supervisor', 'manager'].some((role) => viewer.accessRoles.includes(role))
      && viewer.businessUnitIds.includes(target.businessUnitId))
}
