import { supabase } from '@/lib/supabase'
import { listActiveBranches } from './branches'
import { fetchDefaultStream } from './default-stream'
import { getCafeOpeningProcessId, getTodayOpeningForTeam, wibToday } from './cafe-opening'
import type { TodayOpening } from './cafe-opening'

const shared = () => supabase.schema('shared')

export interface HomeCafeDoorData {
  branchName: string
  opening: TodayOpening
}

async function primaryTeamId(personId: string): Promise<string | null> {
  const { data, error } = await shared()
    .from('team_memberships')
    .select('team_id')
    .eq('person_id', personId)
    .eq('is_primary', true)
    .lte('effective_from', wibToday())
    .is('effective_to', null)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`home primary stream read failed — ${error.message}`)
  return (data as { team_id: string } | null)?.team_id ?? null
}

/** Read the member's actual primary Café stream and today's opening; never starts a run. */
export async function loadHomeCafeDoor(personId: string): Promise<HomeCafeDoorData | null> {
  const [branches, processId, teamId] = await Promise.all([
    listActiveBranches(),
    getCafeOpeningProcessId(),
    primaryTeamId(personId),
  ])
  if (!processId || !teamId) return null

  const stream = await fetchDefaultStream(branches)
  if (!stream) return null

  return {
    branchName: stream.branch.name,
    opening: await getTodayOpeningForTeam(processId, teamId),
  }
}
