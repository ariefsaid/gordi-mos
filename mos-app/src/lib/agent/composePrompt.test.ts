// T7 — buildSystemPrompt(whitelist, primitives, orgId, maxPanels): pure, config-agnostic
// (no PMO/sibling brand string, no data rows), references the MOS entity/primitive
// catalog and the MOS $current_person/$current_org/$today tokens (NOT $current_user).
import { describe, it, expect } from 'vitest'
import { ENTITY_WHITELIST, MAX_PANELS_PER_VIEW } from './../viewspec/types'
import { registryManifest } from './../viewspec/registry-manifest'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src/ (D7)
import { buildSystemPrompt } from '../../../../supabase/functions/compose-view/prompt'

describe('compose-view/prompt — buildSystemPrompt (T7)', () => {
  const prompt = buildSystemPrompt(ENTITY_WHITELIST, registryManifest.keys(), 'org-123', MAX_PANELS_PER_VIEW)

  it('contains every MOS entity key from the whitelist', () => {
    for (const key of Object.keys(ENTITY_WHITELIST)) {
      expect(prompt).toContain(key)
    }
  })

  it('contains every registered primitive name', () => {
    for (const name of registryManifest.keys()) {
      expect(prompt).toContain(name)
    }
  })

  it('references the MOS token set ($current_person/$current_org/$today), not $current_user', () => {
    expect(prompt).toContain('$current_person')
    expect(prompt).toContain('$current_org')
    expect(prompt).toContain('$today')
    expect(prompt).not.toContain('$current_user')
  })

  it('embeds the caller org id', () => {
    expect(prompt).toContain('org-123')
  })

  it('embeds the maxPanels ceiling', () => {
    expect(prompt).toContain(String(MAX_PANELS_PER_VIEW))
  })

  it('is a pure function of its inputs (no data rows — schema metadata only)', () => {
    // No entity ever has a `people`-style row-shaped literal like an email address.
    expect(prompt).not.toMatch(/@[a-z]+\.(com|id)/i)
  })
})
