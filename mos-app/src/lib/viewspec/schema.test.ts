import { describe, it, expect } from 'vitest'
import { COMPOSITION_SPEC_SCHEMA } from './schema'
import { registry } from './registry'
import { ENTITY_WHITELIST } from './types'

describe('COMPOSITION_SPEC_SCHEMA — AC-UV-020', () => {
  it('primitive enum = registry.keys()', () => {
    const primEnum = (COMPOSITION_SPEC_SCHEMA.properties.panels.items.properties.primitive.enum as unknown as string[])
    expect([...primEnum].sort()).toEqual([...registry.keys()].sort())
  })
  it('entity enum = Object.keys(ENTITY_WHITELIST)', () => {
    const entEnum = (COMPOSITION_SPEC_SCHEMA.properties.panels.items.properties.querySpec.properties.entity.enum as unknown as string[])
    expect([...entEnum].sort()).toEqual([...Object.keys(ENTITY_WHITELIST)].sort())
  })
  it('maxItems = MAX_PANELS_PER_VIEW (20)', () => {
    expect(COMPOSITION_SPEC_SCHEMA.properties.panels.maxItems).toBe(20)
  })
})
