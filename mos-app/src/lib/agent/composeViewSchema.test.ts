// AC-P2-CV-001 support (T6) — COMPOSITION_SPEC_SCHEMA's entity enum is DERIVED from the
// live ENTITY_WHITELIST (never hand-listed — the firewall test guards drift) and its
// primitive enum is derived from the pure registry-manifest.
import { describe, it, expect } from 'vitest'
import { ENTITY_WHITELIST, MAX_PANELS_PER_VIEW } from './../viewspec/types'
import { registryManifest } from './../viewspec/registry-manifest'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src/ (D7)
import { COMPOSITION_SPEC_SCHEMA } from '../../../../supabase/functions/compose-view/schema'

describe('compose-view/schema — COMPOSITION_SPEC_SCHEMA (T6)', () => {
  it('entity enum equals Object.keys(ENTITY_WHITELIST)', () => {
    const entityProp = COMPOSITION_SPEC_SCHEMA.properties.panels.items.properties.querySpec.properties.entity
    expect(entityProp.enum.slice().sort()).toEqual(Object.keys(ENTITY_WHITELIST).sort())
  })

  it('primitive enum equals registryManifest.keys()', () => {
    const primitiveProp = COMPOSITION_SPEC_SCHEMA.properties.panels.items.properties.primitive
    expect(primitiveProp.enum.slice().sort()).toEqual(registryManifest.keys().sort())
  })

  it('panels maxItems is MAX_PANELS_PER_VIEW', () => {
    expect(COMPOSITION_SPEC_SCHEMA.properties.panels.maxItems).toBe(MAX_PANELS_PER_VIEW)
  })

  it('version is required and const 1', () => {
    expect(COMPOSITION_SPEC_SCHEMA.required).toContain('version')
    expect(COMPOSITION_SPEC_SCHEMA.properties.version.const).toBe(1)
  })

  it('top level and panel items are additionalProperties: false', () => {
    expect(COMPOSITION_SPEC_SCHEMA.additionalProperties).toBe(false)
    expect(COMPOSITION_SPEC_SCHEMA.properties.panels.items.additionalProperties).toBe(false)
  })
})
