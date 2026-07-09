// T18 (P3a Phase D) — ASK_USER_SCHEMA (ADR-0045 §2 port, FR-P3-AU-001). The model calls ask_user
// to pose a structured clarifying question inline (prompt + tappable option chips + an optional
// free-text box); the handler emits it as a status{kind:'question'} event and ends the stream.
import { describe, it, expect } from 'vitest'
import { ASK_USER_SCHEMA } from './../../../../supabase/functions/agent-chat/schema'

describe('agent-chat/schema — ASK_USER_SCHEMA (T18, FR-P3-AU-001)', () => {
  it('requires prompt + options; additionalProperties false', () => {
    expect(ASK_USER_SCHEMA.required.sort()).toEqual(['options', 'prompt'])
    expect(ASK_USER_SCHEMA.additionalProperties).toBe(false)
  })

  it('prompt is a bounded string', () => {
    expect(ASK_USER_SCHEMA.properties.prompt.type).toBe('string')
    expect(ASK_USER_SCHEMA.properties.prompt.maxLength).toBeGreaterThan(0)
  })

  it('options is an array of {id,label} objects', () => {
    expect(ASK_USER_SCHEMA.properties.options.type).toBe('array')
    expect(ASK_USER_SCHEMA.properties.options.items.required.sort()).toEqual(['id', 'label'])
    expect(ASK_USER_SCHEMA.properties.options.items.additionalProperties).toBe(false)
  })

  it('allowFreeText is an optional boolean', () => {
    expect(ASK_USER_SCHEMA.properties.allowFreeText.type).toBe('boolean')
    expect(ASK_USER_SCHEMA.required).not.toContain('allowFreeText')
  })
})
