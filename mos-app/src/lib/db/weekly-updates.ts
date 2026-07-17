import { supabase } from '@/lib/supabase'
import type {
  WeeklyUpdateRow, WeeklyUpdateItemRow, MyUpdate,
  TeamUpdateRow,
} from './weekly-updates.types'

// Read data layer for mos.weekly_updates (P2-2). Reads mos via supabase.schema('mos') on the
// existing client (ADR-0004 D1). RLS is the authority (ADR-0005, upward-only read). Throws on any
// non-null PostgREST error so the UI can surface failures. Directory name resolution is
// CLIENT-SIDE (P2-1b Fix C1) — no cross-schema embed.
//
// The write path (upsertDraft/submit/reopen/line CRUD) was removed in the Step-11 decommission
// sweep — its only caller was WeeklyUpdateWritePane (retired, superseded by Signals, OD-33). The
// remaining reads stay live: getMyUpdate/listTeamUpdates back the surviving My Week panel
// (ADR-0019 D2) and the Home team module. The table itself is preserved (data preservation is law).

const mos = () => supabase.schema('mos')

/** Load the author's update + ordered lines for (person, week), or null if none (FR-010). */
export async function getMyUpdate(personId: string, weekStart: string): Promise<MyUpdate | null> {
  const { data: update, error } = await mos()
    .from('weekly_updates').select('*')
    .eq('person_id', personId).eq('week_start', weekStart)
    .maybeSingle()
  if (error) throw new Error(`getMyUpdate failed — ${error.message}`)
  if (!update) return null

  const u = update as unknown as WeeklyUpdateRow
  const { data: items, error: itemsErr } = await mos()
    .from('weekly_update_items').select('*')
    .eq('weekly_update_id', u.id)
    .order('position', { ascending: true })
  if (itemsErr) throw new Error(`getMyUpdate lines failed — ${itemsErr.message}`)

  return { update: u, items: (items ?? []) as unknown as WeeklyUpdateItemRow[] }
}

export interface TeamMember {
  person_id: string
  full_name: string
  role_label: string | null
}

/**
 * Build the manager-review roster for `weekStart`: one row per `team` person with their update
 * state (filed / draft / not_started). RLS already returns only updates the viewer may read
 * (author + upward) — for a manager that is exactly their team's set. Names/roles come from the
 * passed `team` roster, NOT a cross-schema embed (P2-1b PGRST200) (FR-030/031/036).
 */
export async function listTeamUpdates(weekStart: string, team: TeamMember[]): Promise<TeamUpdateRow[]> {
  const { data, error } = await mos()
    .from('weekly_updates').select('*')
    .eq('week_start', weekStart)
  if (error) throw new Error(`listTeamUpdates failed — ${error.message}`)

  const rows = (data ?? []) as unknown as WeeklyUpdateRow[]
  const byPerson = new Map(rows.map(r => [r.person_id, r]))

  return team.map((m): TeamUpdateRow => {
    const row = byPerson.get(m.person_id)
    if (!row) {
      return {
        person_id: m.person_id, full_name: m.full_name, role_label: m.role_label,
        state: 'not_started', summary_excerpt: null, submitted_at: null,
      }
    }
    return {
      person_id: m.person_id, full_name: m.full_name, role_label: m.role_label,
      state: row.status === 'submitted' ? 'filed' : 'draft',
      summary_excerpt: row.summary.trim() === '' ? null : row.summary,
      submitted_at: row.submitted_at,
    }
  })
}
