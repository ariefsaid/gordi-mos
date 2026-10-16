// Module switches (preview) — release and admission facts from the REAL registry, and the in-memory
// model the Preview settings uses. Effective availability = released AND Org on AND person not
// blocked AND the person's access level admits the module (an Allow never bypasses any of these).
// Nothing here is persisted or applied to the shell. Contract: R/handover/module-switches.md.
import type { MessageKey } from '@/i18n/messages'
import type { ModuleId, PersonModuleOverride } from '@/lib/db/module-settings'
import { isShipGated } from '@/lib/ship-gate'
import { admittedModules, MODULE_REGISTRY } from '@/shell/module-registry'

export type { ModuleId, PersonModuleOverride }

export interface ModuleFact {
  id: ModuleId
  labelKey: MessageKey
  /** Build/profile released (the ship gate), the first condition of availability. */
  released: boolean
}

/** The registry modules, in registry order, with their real release status. */
export function moduleFacts(): ModuleFact[] {
  return [...MODULE_REGISTRY]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((module) => ({
      id: module.id as ModuleId,
      labelKey: module.labelKey,
      released: !isShipGated(module.primaryPath ?? module.links[0].path),
    }))
}

/** Where "People with personal overrides" leads: the People list, filtered to one module's overrides. */
export const peopleWithOverridesPath = (id: ModuleId) => `/admin/people?overrides=${id}`

export type AvailabilityReason = 'available' | 'notReleased' | 'orgOff' | 'blocked' | 'accessRequired'

export interface AvailabilityInput {
  released: boolean
  orgEnabled: boolean
  override: PersonModuleOverride
  /** The person's access levels admit the module's routes (existing rules, unchanged). */
  admitted: boolean
}

/** Precedence: Not released, Org off, Blocked for this person, Access level required, Available. */
export function effectiveAvailability(input: AvailabilityInput): { available: boolean; reason: AvailabilityReason } {
  if (!input.released) return { available: false, reason: 'notReleased' }
  if (!input.orgEnabled) return { available: false, reason: 'orgOff' }
  if (input.override === 'block') return { available: false, reason: 'blocked' }
  if (!input.admitted) return { available: false, reason: 'accessRequired' }
  return { available: true, reason: 'available' }
}

/** Does this person's access level admit the module at all (ship gate AND existing route admission)? */
export function admittedTo(moduleId: ModuleId, accessRoles: string[]): boolean {
  return admittedModules(accessRoles).some((module) => module.id === moduleId)
}

/** The isolated, in-memory preview model: proposed migration defaults (Org On, people Inherit). */
export interface PreviewModel {
  org: Record<string, boolean>
  people: Record<string, Record<string, PersonModuleOverride>>
}

export const emptyPreviewModel = (): PreviewModel => ({ org: {}, people: {} })
export const previewOrgEnabled = (model: PreviewModel, id: ModuleId) => model.org[id] ?? true
export const previewOverride = (model: PreviewModel, personId: string, id: ModuleId): PersonModuleOverride => model.people[personId]?.[id] ?? 'inherit'
/** How many people carry a personal Allow or Block for this module, inside the preview. */
export const previewPeopleWithOverride = (model: PreviewModel, id: ModuleId) =>
  Object.values(model.people).filter((byModule) => (byModule[id] ?? 'inherit') !== 'inherit').length
