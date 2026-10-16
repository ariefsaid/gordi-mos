// Module switches — typed client stubs for the proposed runtime availability settings.
// DISCONNECTED: the backend tables and functions do not exist yet. Every function here throws a
// typed UNAVAILABLE error and must NOT be called while the backend is absent; the Modules page (Admin › Modules)
// and a person's Modules section show real registry facts and keep every setting in memory only.
// Contract: R/handover/module-switches.md. No schema, permission or write is added by this file.

/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters mirror the handover signatures; nothing is called until the backend is connected */
import { unavailable, type UUID, type WriteContext } from './contract'

// HANDOVER: R/handover/module-switches.md §Client contract — proposed src/lib/db/module-settings.ts
export type ModuleId = 'money' | 'cafe' | 'roastery' | 'ecommerce'
export type PersonModuleOverride = 'inherit' | 'allow' | 'block'
export type OrgModuleSetting = { module_id: ModuleId; enabled: boolean; row_version: number; updated_at: string; updated_by: UUID | null }
export type PersonModuleSetting = {
  person_id: UUID; module_id: ModuleId; override: PersonModuleOverride
  row_version: number; updated_at: string | null; updated_by: UUID | null
}
export type ViewerModuleAvailability = { module_id: ModuleId; org_enabled: boolean; person_override: PersonModuleOverride; enabled: boolean; revision: string }
export type ModuleSettingInput = { module_id: ModuleId; enabled: boolean; expected_version: number }
export type PersonSettingInput = { module_id: ModuleId; override: PersonModuleOverride; expected_version: number }

// HANDOVER: R/handover/module-switches.md §Permission / RPC/write paths — mos.list_org_module_settings()
export async function listOrgModuleSettings(): Promise<OrgModuleSetting[]> {
  return unavailable('listOrgModuleSettings')
}

// HANDOVER: R/handover/module-switches.md §Permission / RPC/write paths — mos.list_person_module_settings(p_person_id)
export async function listPersonModuleSettings(_personId: UUID): Promise<PersonModuleSetting[]> {
  return unavailable('listPersonModuleSettings')
}

// HANDOVER: R/handover/module-switches.md §Permission / RPC/write paths — mos.viewer_module_availability() (own availability only)
export async function getViewerModuleAvailability(): Promise<ViewerModuleAvailability[]> {
  return unavailable('getViewerModuleAvailability')
}

// HANDOVER: R/handover/module-switches.md §Permission / RPC/write paths — mos.save_org_module_settings (atomic batch, versioned)
export async function saveOrgModuleSettings(_rows: readonly ModuleSettingInput[], _ctx: WriteContext): Promise<OrgModuleSetting[]> {
  return unavailable('saveOrgModuleSettings')
}

// HANDOVER: R/handover/module-switches.md §Permission / RPC/write paths — mos.save_person_module_settings (atomic batch, versioned)
export async function savePersonModuleSettings(
  _personId: UUID, _rows: readonly PersonSettingInput[], _ctx: WriteContext,
): Promise<PersonModuleSetting[]> {
  return unavailable('savePersonModuleSettings')
}

// HANDOVER: R/handover/module-switches.md §Permission / RPC/write paths — mos.count_module_disable_impact (null = unknown, never guessed)
export async function countModuleDisableImpact(_moduleId: ModuleId): Promise<{ count: number | null; as_of: string }> {
  return unavailable('countModuleDisableImpact')
}
