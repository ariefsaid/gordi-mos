import { describe, expect, it } from 'vitest'
import { effectiveModuleAccess, type ModuleAccessInput } from './module-access'

describe('effectiveModuleAccess', () => {
  it.each([
    ['Inherit admits a person with the normal role', { released: true, orgEnabled: true, override: 'inherit', roleAdmitted: true }, { available: true, reason: 'available' }],
    ['Inherit requires the normal role', { released: true, orgEnabled: true, override: 'inherit', roleAdmitted: false }, { available: false, reason: 'accessRequired' }],
    ['Allow admits the surface without changing role facts', { released: true, orgEnabled: true, override: 'allow', roleAdmitted: false }, { available: true, reason: 'available' }],
    ['Block defeats even an admitted admin', { released: true, orgEnabled: true, override: 'block', roleAdmitted: true }, { available: false, reason: 'blocked' }],
    ['Org Off defeats Allow', { released: true, orgEnabled: false, override: 'allow', roleAdmitted: false }, { available: false, reason: 'orgOff' }],
    ['the default-Off Assistant remains off under Allow', { released: true, orgEnabled: false, override: 'allow', roleAdmitted: true }, { available: false, reason: 'orgOff' }],
    ['Not released defeats Allow', { released: false, orgEnabled: true, override: 'allow', roleAdmitted: false }, { available: false, reason: 'notReleased' }],
    ['Org Off takes precedence over Block', { released: true, orgEnabled: false, override: 'block', roleAdmitted: true }, { available: false, reason: 'orgOff' }],
    ['Not released takes precedence over Org Off', { released: false, orgEnabled: false, override: 'block', roleAdmitted: true }, { available: false, reason: 'notReleased' }],
  ] as const)('%s', (_name, input, expected) => {
    expect(effectiveModuleAccess(input as ModuleAccessInput)).toEqual(expected)
  })
})
