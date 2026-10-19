import type { MessageKey } from '@/i18n/messages'
import type { ModuleId } from '@/lib/db/module-settings'
import { isShipGated } from '@/lib/ship-gate'
import { admittedModules, MODULE_REGISTRY } from '@/shell/module-registry'

export type { ModuleId }

export type ModuleFact = {
  id: ModuleId
  labelKey: MessageKey
  released: boolean
}

export function moduleFacts(): ModuleFact[] {
  const registryFacts = new Map(MODULE_REGISTRY.map((module) => [module.id, {
    id: module.id as ModuleId,
    labelKey: module.labelKey,
    released: !isShipGated(module.primaryPath ?? module.links[0].path),
  }]))
  return [
    { id: 'work', labelKey: 'dest.work', released: true },
    registryFacts.get('money'),
    registryFacts.get('cafe'),
    { id: 'assistant', labelKey: 'admin.modules.assistant', released: true },
    registryFacts.get('roastery'),
    registryFacts.get('ecommerce'),
  ].filter((fact): fact is ModuleFact => fact !== undefined)
}

export function roleAdmittedTo(moduleId: ModuleId, accessRoles: string[]): boolean {
  if (moduleId === 'work' || moduleId === 'assistant') return true
  // Admin's role-only comparison is independent of org settings and personal overrides.
  return admittedModules(accessRoles, (_id, roleAdmitted = true) => roleAdmitted).some((module) => module.id === moduleId)
}

export const peopleWithOverridesPath = (id: ModuleId) => `/admin/people?overrides=${id}`
