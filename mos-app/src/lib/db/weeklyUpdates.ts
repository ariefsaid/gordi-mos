import { supabase } from '../supabase'
import type {
  WeeklyUpdateRow, WeeklyUpdateItemRow, MyUpdate, ProgressMarker,
  TeamUpdateRow,
} from './weeklyUpdates.types'

// Data layer for mos.weekly_updates (P2-2). Reads/writes mos via supabase.schema('mos') on the
// existing client (ADR-0004 D1). RLS is the authority (ADR-0005, upward-only read): this layer
// NEVER sends org_id (the DB default stamps it) and NEVER sends submitted_at (the _stamp_submitted_at
// trigger owns it from the status transition). Throws on any non-null PostgREST error so the UI can
// surface failures. Directory name resolution is CLIENT-SIDE (P2-1b Fix C1) — no cross-schema embed.

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

export interface DraftLine {
  id?: string
  label: string
  progress: ProgressMarker
  position: number
}
export interface UpsertDraftInput {
  id?: string
  personId: string
  weekStart: string
  createdBy: string
  summary: string
  lines: DraftLine[]
}

/**
 * Insert-or-update the author's draft (status forced 'draft'), then diff the lines: insert new
 * (no id), update edited (id present), delete removed. Returns the update id (FR-012/016/017).
 * The DB owns org_id + submitted_at; this never sends them.
 */
export async function upsertDraft(input: UpsertDraftInput): Promise<string> {
  let updateId: string
  if (input.id) {
    const { error } = await mos().from('weekly_updates')
      .update({ summary: input.summary, status: 'draft' })
      .eq('id', input.id)
    if (error) throw new Error(`upsertDraft (update) failed — ${error.message}`)
    updateId = input.id
  } else {
    const { data, error } = await mos().from('weekly_updates')
      .insert({
        person_id: input.personId,
        week_start: input.weekStart,
        created_by: input.createdBy,
        summary: input.summary,
        status: 'draft',
      })
      .select('id').single()
    if (error) throw new Error(`upsertDraft (insert) failed — ${error.message}`)
    updateId = (data as { id: string }).id
  }

  await diffLines(updateId, input.lines)
  return updateId
}

/** Reconcile the persisted lines against the desired set: delete removed, update kept, insert new. */
async function diffLines(updateId: string, lines: DraftLine[]): Promise<void> {
  const { data: existing, error } = await mos()
    .from('weekly_update_items').select('id')
    .eq('weekly_update_id', updateId)
  if (error) throw new Error(`upsertDraft (load lines) failed — ${error.message}`)

  const existingIds = new Set(((existing ?? []) as { id: string }[]).map(r => r.id))
  const keptIds = new Set(lines.filter(l => l.id).map(l => l.id as string))

  for (const id of existingIds) {
    if (!keptIds.has(id)) await removeLine(id)
  }
  for (const line of lines) {
    if (line.id && existingIds.has(line.id)) {
      await updateLine(line.id, { label: line.label, progress: line.progress, position: line.position })
    } else {
      await addLine(updateId, line.label, line.progress, line.position)
    }
  }
}

/** Submit: set status='submitted' (the trigger stamps submitted_at) (FR-013). */
export async function submit(id: string): Promise<void> {
  const { error } = await mos().from('weekly_updates').update({ status: 'submitted' }).eq('id', id)
  if (error) throw new Error(`submit failed — ${error.message}`)
}

/** Reopen: set status='draft' (the trigger clears submitted_at) (FR-014). */
export async function reopen(id: string): Promise<void> {
  const { error } = await mos().from('weekly_updates').update({ status: 'draft' }).eq('id', id)
  if (error) throw new Error(`reopen failed — ${error.message}`)
}

/** Add a line at `position`. RLS requires the parent to be the caller's own + draft (FR-016). */
export async function addLine(
  updateId: string, label: string, progress: ProgressMarker, position: number,
): Promise<string> {
  const { data, error } = await mos().from('weekly_update_items')
    .insert({ weekly_update_id: updateId, label, progress, position })
    .select('id').single()
  if (error) throw new Error(`addLine failed — ${error.message}`)
  return (data as { id: string }).id
}

/** Edit a line's label/progress/position (FR-017). */
export async function updateLine(
  itemId: string, patch: Partial<Pick<WeeklyUpdateItemRow, 'label' | 'progress' | 'position'>>,
): Promise<void> {
  const { error } = await mos().from('weekly_update_items').update(patch).eq('id', itemId)
  if (error) throw new Error(`updateLine failed — ${error.message}`)
}

/** Remove a line (FR-017). */
export async function removeLine(itemId: string): Promise<void> {
  const { error } = await mos().from('weekly_update_items').delete().eq('id', itemId)
  if (error) throw new Error(`removeLine failed — ${error.message}`)
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
