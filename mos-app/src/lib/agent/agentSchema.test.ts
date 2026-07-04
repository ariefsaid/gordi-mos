// T13 — agent-chat/schema.ts tool input schemas (AC-WT-001/005). Only the P2 catalog schemas
// are kept: QUERY_ENTITY_SCHEMA, CREATE_TASK_SCHEMA, POST_UPDATE_SCHEMA, COMPOSE_VIEW_INPUT_SCHEMA
// (no NOTIFY/CREATE_AUTOMATION/ASK_USER — P3).
import { describe, it, expect } from 'vitest'
import { AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP } from './../../../../supabase/functions/agent-chat/readEntities'
import {
  QUERY_ENTITY_SCHEMA, CREATE_TASK_SCHEMA, POST_UPDATE_SCHEMA, COMPOSE_VIEW_INPUT_SCHEMA,
} from './../../../../supabase/functions/agent-chat/schema'

describe('agent-chat/schema — tool input schemas (T13)', () => {
  it('QUERY_ENTITY_SCHEMA.entity enum equals AGENT_READ_ENTITIES', () => {
    expect(QUERY_ENTITY_SCHEMA.properties.entity.enum.slice().sort()).toEqual(
      [...AGENT_READ_ENTITIES].sort(),
    )
  })

  it('QUERY_ENTITY_SCHEMA.limit maximum is AGENT_READ_ROW_CAP', () => {
    expect(QUERY_ENTITY_SCHEMA.properties.limit.maximum).toBe(AGENT_READ_ROW_CAP)
  })

  it('QUERY_ENTITY_SCHEMA requires entity, additionalProperties false', () => {
    expect(QUERY_ENTITY_SCHEMA.required).toEqual(['entity'])
    expect(QUERY_ENTITY_SCHEMA.additionalProperties).toBe(false)
  })

  it('CREATE_TASK_SCHEMA requires title/businessUnitId/responsiblePersonId/accountablePersonId — never createdBy (FR-WT-004)', () => {
    expect(CREATE_TASK_SCHEMA.required.sort()).toEqual(
      ['accountablePersonId', 'businessUnitId', 'responsiblePersonId', 'title'].sort(),
    )
    expect(Object.keys(CREATE_TASK_SCHEMA.properties)).not.toContain('createdBy')
    expect(CREATE_TASK_SCHEMA.additionalProperties).toBe(false)
  })

  it('POST_UPDATE_SCHEMA requires label/progress; progress is the 3-state enum', () => {
    expect(POST_UPDATE_SCHEMA.required.sort()).toEqual(['label', 'progress'])
    expect(POST_UPDATE_SCHEMA.properties.progress.enum.slice().sort()).toEqual(
      ['blocked', 'done', 'in_progress'],
    )
    expect(POST_UPDATE_SCHEMA.additionalProperties).toBe(false)
  })

  it('COMPOSE_VIEW_INPUT_SCHEMA is {prompt: string}, required, additionalProperties false', () => {
    expect(COMPOSE_VIEW_INPUT_SCHEMA.required).toEqual(['prompt'])
    expect(COMPOSE_VIEW_INPUT_SCHEMA.properties.prompt.type).toBe('string')
    expect(COMPOSE_VIEW_INPUT_SCHEMA.additionalProperties).toBe(false)
  })
})
