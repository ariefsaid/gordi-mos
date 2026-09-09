import { listActiveBranches } from './branches'
import { fetchDefaultStream } from './default-stream'
import { getCafeOpeningProcessId, getCafeOpeningTeamId, getTodayOpeningForTeam } from './cafe-opening'
import type { TodayOpening } from './cafe-opening'

export interface HomeCafeDoorData {
  branchName: string
  opening: TodayOpening
}

/** Read the viewer's default Café branch and that branch's canonical opening; never starts a run. */
export async function loadHomeCafeDoor(): Promise<HomeCafeDoorData | null> {
  const [branches, processId] = await Promise.all([
    listActiveBranches(),
    getCafeOpeningProcessId(),
  ])
  if (!processId) return null

  const stream = await fetchDefaultStream(branches)
  if (!stream) return null
  const teamId = await getCafeOpeningTeamId(stream.branch.id)
  if (!teamId) return null

  return {
    branchName: stream.branch.name,
    opening: await getTodayOpeningForTeam(processId, teamId),
  }
}
