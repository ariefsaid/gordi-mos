import { describe, it, expect } from 'vitest'
import { ENTITY_WHITELIST } from './../viewspec/types'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src/ (D7)
import { AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP } from '../../../../supabase/functions/agent-chat/readEntities'

// T12 — readEntities.ts is a dependency-free LEAF module (cycle-breaker, mirrors the
// sibling project's TDZ-crash lesson documented in its own header). AGENT_READ_ENTITIES
// is DERIVED from ENTITY_WHITELIST, never hand-listed (AC-P2-RT-003/005).
describe('agent-chat/readEntities — T12', () => {
  it('AGENT_READ_ENTITIES equals Object.keys(ENTITY_WHITELIST) (all 8 MOS entities)', () => {
    expect([...AGENT_READ_ENTITIES].sort()).toEqual(Object.keys(ENTITY_WHITELIST).sort())
  })

  it('AGENT_READ_ROW_CAP is 50', () => {
    expect(AGENT_READ_ROW_CAP).toBe(50)
  })
})
