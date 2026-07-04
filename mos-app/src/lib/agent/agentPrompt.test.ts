// T14 — agent-chat/prompt.ts buildAgentSystemPrompt (FR-P2-GR-001, AC-P2-GR-001, D5).
// The GROUNDING rule is the delta vs the sibling reference's prompt.ts (which lacks it).
import { describe, it, expect } from 'vitest'
import { AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP } from './../../../../supabase/functions/agent-chat/readEntities'
import { buildAgentSystemPrompt } from './../../../../supabase/functions/agent-chat/prompt'

describe('agent-chat/prompt — buildAgentSystemPrompt (T14, AC-P2-GR-001)', () => {
  const prompt = buildAgentSystemPrompt(AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP)

  it('binds the deputy to query before answering', () => {
    expect(prompt).toContain('query_entity')
  })

  it('binds the deputy to say "no data" and stop on an empty/failed read', () => {
    expect(prompt.toLowerCase()).toContain('rowcount 0')
    expect(prompt).toContain('no data')
  })

  it('binds the deputy to cite snapshot_as_of on reporting figures', () => {
    expect(prompt).toContain('snapshot_as_of')
  })

  it('forbids answering a data question from memory/training data', () => {
    expect(prompt).toContain('NEVER answer a data question from memory')
  })

  it('describes every whitelisted entity (schema metadata only — no data rows)', () => {
    for (const entity of AGENT_READ_ENTITIES) {
      expect(prompt).toContain(entity)
    }
  })

  it('cites the row cap', () => {
    expect(prompt).toContain(String(AGENT_READ_ROW_CAP))
  })
})
