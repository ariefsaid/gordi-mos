// The canonical branch catalog (`shared.branches`, OD-WAY-39).
//
// A branch is an inventory-and-accounting context — whose books a movement lands in — never
// a physical place, and never `shared.sites` (which is org structure for Teams). Every
// branch-bearing surface resolves against this one list, so a stream, a transfer destination
// and a derived label all name the same rows.
//
// The client NEVER sends org_id; RLS scopes the read (directory.ts pattern).

import { supabase } from '@/lib/supabase'
import type { BranchOption } from './kitchen-logs.types'

const shared = () => supabase.schema('shared')

/** Active (non-archived) branches, by name. Archived branches are excluded: historical
 *  movements still reference them, but nothing new may be captured against one. */
export async function listActiveBranches(): Promise<BranchOption[]> {
  const { data, error } = await shared()
    .from('branches')
    .select('id,code,name')
    .is('archived_at', null)
    .order('name', { ascending: true })
  if (error) throw new Error(`listActiveBranches failed — ${error.message}`)
  return (data ?? []) as BranchOption[]
}
