import { supabase } from '@/lib/supabase'

/** Effective Work write authority for the current viewer, resolved by mos runtime policy. */
export interface WorkWriteScopes {
  workline_org: boolean
  objective_org: boolean
  workline_bu_ids: string[]
  objective_bu_ids: string[]
}

const mos = () => supabase.schema('mos')

const EMPTY_SCOPES: WorkWriteScopes = {
  workline_org: false,
  objective_org: false,
  workline_bu_ids: [],
  objective_bu_ids: [],
}

function authorityRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) {
    const first = data[0]
    return first && typeof first === 'object' ? first as Record<string, unknown> : {}
  }
  return data && typeof data === 'object' ? data as Record<string, unknown> : {}
}

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * Resolve the effective Work create/edit scope. The RPC is deliberately the only source for
 * mutation affordances: role names in the JWT are not sufficient once admin-managed authority
 * rows can override the defaults.
 */
export async function getWorkWriteScopes(): Promise<WorkWriteScopes> {
  const { data, error } = await mos().rpc('get_work_write_scopes')
  if (error) throw new Error(`getWorkWriteScopes failed — ${error.message}`)
  const row = authorityRow(data)
  return {
    workline_org: row.workline_org === true,
    objective_org: row.objective_org === true,
    workline_bu_ids: stringIds(row.workline_bu_ids),
    objective_bu_ids: stringIds(row.objective_bu_ids),
  }
}

/** A safe empty value for UI callers that need to initialize before an authority read settles. */
export function emptyWorkWriteScopes(): WorkWriteScopes {
  return { ...EMPTY_SCOPES, workline_bu_ids: [], objective_bu_ids: [] }
}
