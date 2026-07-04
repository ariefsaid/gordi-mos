// T16 — agent-chat/actions.ts the tool catalog v1 (query_entity + create_task + post_update +
// compose_view). AC-RT-001..004, AC-WT-001/002/004/005, AC-OB-001 (via journal, exercised in
// handler tests). Mocked DeputyContext.supabase (schema-scoped, per D2/MOS delta).
import { describe, it, expect, vi } from 'vitest'
import {
  runQueryEntity, queryEntityAction, createTaskAction, postUpdateAction, composeViewAction,
  BASE_ACTIONS, runComposeView, deriveTitle,
} from './../../../../supabase/functions/agent-chat/actions'
import type { DeputyContext } from './runtime/port'

// ── Test doubles ───────────────────────────────────────────────────────────────

function makeCtx(overrides: {
  selectResult?: { data: unknown[] | null; error: unknown }
  insertResult?: (table: string, row: Record<string, unknown>) => { data: unknown; error: unknown }
  maybeSingleResult?: { data: unknown; error: unknown }
} = {}): { ctx: DeputyContext; selectSpy: ReturnType<typeof vi.fn>; insertSpy: ReturnType<typeof vi.fn> } {
  const selectResult = overrides.selectResult ?? { data: [{ id: '1', title: 'Task A' }], error: null }
  const insertResultFn = overrides.insertResult ?? ((_table: string, row: Record<string, unknown>) => ({ data: { id: 'new-id', ...row }, error: null }))
  const maybeSingleResult = overrides.maybeSingleResult ?? { data: null, error: null }

  const selectSpy = vi.fn(async () => selectResult)
  const insertSpy = vi.fn((table: string, row: Record<string, unknown>) => insertResultFn(table, row))

  const tableOps = (table: string) => ({
    select: () => ({
      eq: () => ({ limit: selectSpy, maybeSingle: async () => maybeSingleResult, eq: () => ({ maybeSingle: async () => maybeSingleResult }) }),
      in: () => ({ limit: selectSpy }),
      limit: selectSpy,
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({ single: async () => insertSpy(table, row) }),
    }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })

  const ctx: DeputyContext = {
    jwt: '', userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
    supabase: {
      from: tableOps,
      schema: () => ({ from: tableOps }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }
  return { ctx, selectSpy, insertSpy }
}

// ── query_entity (AC-RT-001..004) ─────────────────────────────────────────────

describe('runQueryEntity (T16, AC-RT-001..004)', () => {
  it('AC-RT-001: valid entity+columns -> {rowCount, rows}', async () => {
    const { ctx } = makeCtx({ selectResult: { data: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], error: null } })
    const result = await runQueryEntity({ entity: 'tasks', columns: ['title'] }, ctx)
    expect(result).toEqual({ rowCount: 3, rows: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] })
  })

  it('AC-RT-002: unknown entity -> {error} without calling ctx.supabase', async () => {
    const { ctx, selectSpy } = makeCtx()
    const result = await runQueryEntity({ entity: 'not_real' }, ctx)
    expect(result).toEqual({ error: 'unknown entity: not_real' })
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('AC-RT-003: unknown column -> structured error', async () => {
    const { ctx } = makeCtx()
    const result = await runQueryEntity({ entity: 'tasks', columns: ['secret_col'] }, ctx)
    expect(result).toEqual({ error: 'unknown column: secret_col on entity tasks' })
  })

  it('AC-RT-003: unknown filter column -> structured error (filter-column whitelist)', async () => {
    const { ctx } = makeCtx()
    const result = await runQueryEntity({ entity: 'tasks', filter: { column: 'org_id', op: 'eq', value: 'x' } }, ctx)
    expect(result).toEqual({ error: 'unknown filter column: org_id on entity tasks' })
  })

  it('AC-RT-004: limit 9999 -> the dispatched .limit() receives the 50 cap', async () => {
    const { ctx, selectSpy } = makeCtx()
    await runQueryEntity({ entity: 'tasks', limit: 9999 }, ctx)
    expect(selectSpy).toHaveBeenCalledWith(50)
  })

  it('a db error surfaces as a structured error, never throws', async () => {
    const { ctx } = makeCtx({ selectResult: { data: null, error: { code: 'XXXXX' } } })
    const result = await runQueryEntity({ entity: 'tasks' }, ctx)
    expect(result).toEqual({ error: 'query_entity db error' })
  })
})

describe('queryEntityAction (T16, AC-WT-005 catalog shape)', () => {
  it('is confirm:false and read-only', () => {
    expect(queryEntityAction.name).toBe('query_entity')
    expect(queryEntityAction.confirm).toBe(false)
  })
})

// ── create_task (AC-WT-001/002/004) ───────────────────────────────────────────

describe('createTaskAction (T16, AC-WT-001/002/004)', () => {
  it('is confirm:true', () => {
    expect(createTaskAction.confirm).toBe(true)
  })

  it('validate() requires title/businessUnitId/responsiblePersonId/accountablePersonId', () => {
    const v = createTaskAction.validate({ title: 'x' })
    expect(v.ok).toBe(false)
  })

  it('validate() accepts a well-formed input', () => {
    const v = createTaskAction.validate({
      title: 'Ship the report', businessUnitId: 'bu-1',
      responsiblePersonId: 'p-r', accountablePersonId: 'p-a',
    })
    expect(v.ok).toBe(true)
  })

  it('summarize() is a server-composed human string mentioning the title', () => {
    const summary = createTaskAction.summarize({
      title: 'Ship the report', businessUnitId: 'bu-1',
      responsiblePersonId: 'p-r', accountablePersonId: 'p-a',
    })
    expect(summary).toContain('Ship the report')
  })

  it('run() inserts mos.tasks with created_by = ctx.personId (FR-WT-004), never a model-supplied value', async () => {
    const { ctx, insertSpy } = makeCtx()
    const forgedCtx: DeputyContext = { ...ctx, personId: 'real-person-1' }
    const result = await createTaskAction.run(
      {
        title: 'Ship it', businessUnitId: 'bu-1', responsiblePersonId: 'p-r',
        accountablePersonId: 'p-a', createdBy: 'forged-person-999',
      },
      forgedCtx,
    )
    expect(insertSpy).toHaveBeenCalled()
    const [table, row] = insertSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(table).toBe('tasks')
    expect(row.created_by).toBe('real-person-1')
    expect(row.created_by).not.toBe('forged-person-999')
    expect(result).toMatchObject({ id: 'new-id' })
  })

  it('run() also inserts a task_events created row', async () => {
    const { ctx, insertSpy } = makeCtx()
    await createTaskAction.run(
      { title: 'Ship it', businessUnitId: 'bu-1', responsiblePersonId: 'p-r', accountablePersonId: 'p-a' },
      ctx,
    )
    const tables = insertSpy.mock.calls.map((c) => c[0])
    expect(tables).toContain('task_events')
  })

  it('run() returns {error} on invalid args without inserting', async () => {
    const { ctx, insertSpy } = makeCtx()
    const result = await createTaskAction.run({ title: '' }, ctx)
    expect(result).toHaveProperty('error')
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

// ── post_update (AC-WT-001/002/004, add-line only per Director decision 2) ───

describe('postUpdateAction (T16, add-line only)', () => {
  it('is confirm:true', () => {
    expect(postUpdateAction.confirm).toBe(true)
  })

  it('validate() requires label + progress', () => {
    expect(postUpdateAction.validate({}).ok).toBe(false)
    expect(postUpdateAction.validate({ label: 'x', progress: 'done' }).ok).toBe(true)
  })

  it('summarize() mentions the label', () => {
    const summary = postUpdateAction.summarize({ label: 'Finished the deck', progress: 'done', weekStart: '2026-07-06' })
    expect(summary).toContain('Finished the deck')
  })

  it('run() creates a draft weekly_update (if none exists) then a line, attributed to ctx.personId', async () => {
    const { ctx, insertSpy } = makeCtx({ maybeSingleResult: { data: null, error: null } })
    const result = await postUpdateAction.run({ label: 'Did a thing', progress: 'in_progress', weekStart: '2026-07-06' }, ctx)
    const tables = insertSpy.mock.calls.map((c) => c[0])
    expect(tables).toContain('weekly_updates')
    expect(tables).toContain('weekly_update_items')
    const updateInsertRow = insertSpy.mock.calls.find((c) => c[0] === 'weekly_updates')?.[1] as Record<string, unknown>
    expect(updateInsertRow.person_id).toBe('person-1')
    expect(updateInsertRow.created_by).toBe('person-1')
    expect(result).toMatchObject({ id: 'new-id' })
  })

  it('run() reuses an existing draft update instead of creating a second one', async () => {
    const { ctx, insertSpy } = makeCtx({ maybeSingleResult: { data: { id: 'existing-update', status: 'draft' }, error: null } })
    await postUpdateAction.run({ label: 'Did a thing', progress: 'done', weekStart: '2026-07-06' }, ctx)
    const tables = insertSpy.mock.calls.map((c) => c[0])
    expect(tables).not.toContain('weekly_updates')
    expect(tables).toContain('weekly_update_items')
  })
})

// ── compose_view (guard stub + runComposeView delegation) ────────────────────

describe('composeViewAction / runComposeView (T16)', () => {
  it('composeViewAction.run is a guard stub that throws if called directly', () => {
    expect(() => composeViewAction.run({}, {} as DeputyContext)).toThrow()
  })

  it('deriveTitle trims/capitalizes/truncates the prompt', () => {
    expect(deriveTitle('  show me sales by branch  ')).toBe('Show me sales by branch')
    expect(deriveTitle('')).toBe('')
  })

  it('runComposeView delegates to composeSpec and returns {spec, repairAttempts, tokensUsed, title}', async () => {
    const { ctx } = makeCtx()
    const modelClient = {
      create: vi.fn(async () => ({
        finish_reason: 'tool_calls',
        model: 'test-model',
        message: {
          role: 'assistant' as const,
          content: null,
          tool_calls: [{
            id: 'call-1', type: 'function' as const,
            function: {
              name: 'compose_view',
              arguments: JSON.stringify({
                version: 1,
                panels: [{ id: 'p1', primitive: 'KPITile', querySpec: { entity: 'objectives', select: ['id'] } }],
              }),
            },
          }],
        },
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })),
    }
    const result = await runComposeView({ prompt: 'show my tasks' }, ctx, { modelClient, model: 'test-model' })
    expect(result).not.toHaveProperty('error')
    if (!('error' in result)) {
      expect(result.title).toBe('Show my tasks')
      expect(result.repairAttempts).toBe(0)
    }
  })
})

// ── BASE_ACTIONS catalog (AC-WT-005) ──────────────────────────────────────────

describe('BASE_ACTIONS catalog (T16, AC-WT-005/FR-WT-005)', () => {
  it('contains exactly query_entity, create_task, post_update — no provisioning tool', () => {
    expect(BASE_ACTIONS.map((a) => a.name).sort()).toEqual(
      ['create_task', 'post_update', 'query_entity'].sort(),
    )
  })
})
