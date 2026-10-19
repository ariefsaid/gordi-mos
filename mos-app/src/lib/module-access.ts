export type PersonModuleOverride = 'inherit' | 'allow' | 'block'
export type ModuleAccessInput = Readonly<{
  released: boolean
  orgEnabled: boolean
  override: PersonModuleOverride
  roleAdmitted: boolean
}>
export type ModuleAccessResult =
  | { available: true; reason: 'available' }
  | { available: false; reason: 'notReleased' | 'orgOff' | 'blocked' | 'accessRequired' }

export function effectiveModuleAccess(input: ModuleAccessInput): ModuleAccessResult {
  if (!input.released) return { available: false, reason: 'notReleased' }
  if (!input.orgEnabled) return { available: false, reason: 'orgOff' }
  if (input.override === 'block') return { available: false, reason: 'blocked' }
  if (input.override === 'allow' || input.roleAdmitted) return { available: true, reason: 'available' }
  return { available: false, reason: 'accessRequired' }
}
