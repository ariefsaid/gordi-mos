import { supabase } from '@/lib/supabase'
import { ContractError, unavailable, type UUID, type WriteContext } from './contract'

export type ModuleId = 'work' | 'money' | 'cafe' | 'staff' | 'roastery' | 'ecommerce' | 'assistant'
import type { PersonModuleOverride } from '@/lib/module-access'
export type { PersonModuleOverride }
export type OrgModuleSetting = { module_id: ModuleId; enabled: boolean; row_version: number; updated_at: string | null; updated_by: UUID | null }
export type PersonModuleSetting = {
  person_id: UUID; module_id: ModuleId; override: PersonModuleOverride
  row_version: number; updated_at: string | null; updated_by: UUID | null; org_enabled: boolean
}
export type ViewerModuleAvailability = {
  module_id: ModuleId; enabled: boolean; revision: string; person_override: PersonModuleOverride
}
export type ModuleSettingInput = { module_id: ModuleId; enabled: boolean; expected_version: number }
export type PersonSettingInput = { module_id: ModuleId; override: PersonModuleOverride; expected_version: number }

const mos = () => supabase.schema('mos')

function fail(action: string, error: { code?: string; message: string }): Error {
  if (error.code === '40001') return new ContractError('CONFLICT', 'Module settings changed, reload.')
  console.error(`[module-settings] ${action} failed`, error)
  return new Error(`Couldn't ${action}. Try again.`)
}

export async function listOrgModuleSettings(): Promise<OrgModuleSetting[]> {
  const { data, error } = await mos().rpc('list_org_module_settings')
  if (error) throw fail('load module settings', error)
  return (data ?? []) as OrgModuleSetting[]
}

export async function getViewerModuleAvailability(): Promise<ViewerModuleAvailability[]> {
  const { data, error } = await mos().rpc('viewer_module_availability')
  if (error) throw fail('load module availability', error)
  return (data ?? []) as ViewerModuleAvailability[]
}

export async function saveOrgModuleSettings(rows: readonly ModuleSettingInput[], ctx: WriteContext): Promise<OrgModuleSetting[]> {
  const { data, error } = await mos().rpc('save_org_module_settings', {
    p_rows: rows,
    p_client_request_id: ctx.client_request_id,
  })
  if (error) throw fail('save module settings', error)
  return (data ?? []) as OrgModuleSetting[]
}

export async function listPersonModuleSettings(personId: UUID): Promise<PersonModuleSetting[]> {
  const { data, error } = await mos().rpc('list_person_module_settings', { p_person_id: personId })
  if (error) throw fail('load person module settings', error)
  return (data ?? []) as PersonModuleSetting[]
}

export async function savePersonModuleSettings(
  personId: UUID, rows: readonly PersonSettingInput[], ctx: WriteContext,
): Promise<PersonModuleSetting[]> {
  const { data, error } = await mos().rpc('save_person_module_settings', {
    p_person_id: personId,
    p_rows: rows,
    p_client_request_id: ctx.client_request_id,
  })
  if (error) throw fail('save person module settings', error)
  return (data ?? []) as PersonModuleSetting[]
}

// HANDOVER: R/handover/module-switches.md §Client — impact counts are not connected.
export async function countModuleDisableImpact(_moduleId: ModuleId): Promise<{ count: number | null; as_of: string }> {
  void _moduleId
  return unavailable('countModuleDisableImpact')
}
