import { describe, expect, it } from 'vitest'
import {
  admittedTo, effectiveAvailability, emptyPreviewModel, moduleFacts, previewPeopleWithOverride, previewOrgEnabled, previewOverride,
} from './module-switches-preview'

const base = { released: true, orgEnabled: true, override: 'inherit' as const, admitted: true }

describe('effective availability', () => {
  it('is available when released, Org on, not blocked and admitted', () => {
    expect(effectiveAvailability(base)).toEqual({ available: true, reason: 'available' })
  })

  it('never lets Allow bypass Not released, Org off or the access level', () => {
    expect(effectiveAvailability({ ...base, released: false, override: 'allow' }).reason).toBe('notReleased')
    expect(effectiveAvailability({ ...base, orgEnabled: false, override: 'allow' }).reason).toBe('orgOff')
    expect(effectiveAvailability({ ...base, admitted: false, override: 'allow' })).toEqual({ available: false, reason: 'accessRequired' })
  })

  it('lets Block dominate an On Org', () => {
    expect(effectiveAvailability({ ...base, override: 'block' })).toEqual({ available: false, reason: 'blocked' })
  })

  it('names the earliest failing condition first', () => {
    expect(effectiveAvailability({ released: false, orgEnabled: false, override: 'block', admitted: false }).reason).toBe('notReleased')
    expect(effectiveAvailability({ ...base, orgEnabled: false, override: 'block', admitted: false }).reason).toBe('orgOff')
    expect(effectiveAvailability({ ...base, override: 'block', admitted: false }).reason).toBe('blocked')
  })
})

describe('registry facts', () => {
  it('lists switchable modules in Admin order and keeps the registry release status', () => {
    const facts = moduleFacts()
    expect(facts.map((fact) => fact.id)).toEqual(['work', 'money', 'cafe', 'assistant', 'roastery', 'ecommerce'])
    expect(facts.find((fact) => fact.id === 'work')?.released).toBe(true)
    expect(facts.find((fact) => fact.id === 'assistant')?.released).toBe(true)
    expect(facts.find((fact) => fact.id === 'cafe')?.released).toBe(true)
    expect(facts.find((f) => f.id === 'roastery')?.released).toBe(false)
    expect(facts.find((f) => f.id === 'ecommerce')?.released).toBe(false)
  })

  it('reads admission from the existing access levels, never from a setting', () => {
    expect(admittedTo('cafe', [])).toBe(true)
    expect(admittedTo('money', ['finance'])).toBe(true)
    expect(admittedTo('money', ['member'])).toBe(false)
    expect(admittedTo('roastery', ['admin'])).toBe(false)
  })
})

describe('preview model', () => {
  it('starts with Assistant Off, other modules On, and people Inherit', () => {
    const model = emptyPreviewModel()
    expect(previewOrgEnabled(model, 'assistant')).toBe(false)
    expect(previewOrgEnabled(model, 'cafe')).toBe(true)
    expect(previewOverride(model, 'p1', 'cafe')).toBe('inherit')
    expect(previewPeopleWithOverride(model, 'cafe')).toBe(0)
    expect(previewOrgEnabled({ ...model, org: { assistant: true } }, 'assistant')).toBe(true)
  })

  it('counts only real overrides, per person and per module', () => {
    const model = { org: { money: false }, people: { p1: { cafe: 'block' as const, money: 'inherit' as const } } }
    expect(previewPeopleWithOverride(model, 'cafe')).toBe(1)
    expect(previewPeopleWithOverride(model, 'money')).toBe(0)
  })
})
