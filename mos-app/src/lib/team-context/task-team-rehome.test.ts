import { describe, it, expect } from 'vitest'
import {
  classifyTaskTeamRehome,
  buildRehomeReport,
  formatRatifyLine,
  type LegacyTaskRow,
  type RehomeContext,
} from './task-team-rehome'

// AC-801/802/803 (lower-level proofs of FR-V3-003 / NFR-V3-008/009): the deterministic BU->Team
// re-home. This is the DB-free reference implementation of the rules the migration's
// mos._rehome_task_teams() function must apply. The migration itself is a SKIPPED DB deliverable
// (see report), but the *rules* — and the fail-closed handling of ambiguous legacy rows — are
// proven here so no first-row/primary/name/BU-label fallback can slip in.
//
// Rules (plan §Deterministic backfill):
//  1. Generated occurrence Task (has process_run_id) + valid same-org run whose owning Team exists
//     and whose Team BU equals the Task BU -> resolve via run.
//  2. Legacy Task with NO process_run_id -> resolve only when exactly one active same-org Team
//     exists in the Task's BU.
//  3. Everything else stays UNRESOLVED with a reason category (fail closed).
//  4. Never choose first/primary/name/membership/BU-label as a fallback.

const task = (over: Partial<LegacyTaskRow> & { id: string }): LegacyTaskRow => ({
  org_id: 'org-1',
  business_unit_id: 'bu-1',
  process_run_id: null,
  ...over,
})

const ctx = (over: Partial<RehomeContext> = {}): RehomeContext => ({
  runsById: new Map(),
  teamsById: new Map(),
  activeTeamIdsByBu: new Map(),
  ...over,
})

describe('classifyTaskTeamRehome — AC-801 run-backed occurrence Task', () => {
  it('resolves a generated Task via its run owning Team when the Team BU matches', () => {
    const context = ctx({
      runsById: new Map([['run-1', { orgId: 'org-1', owningTeamId: 't1' }]]),
      teamsById: new Map([['t1', { orgId: 'org-1', businessUnitId: 'bu-1', archived: false }]]),
    })
    const result = classifyTaskTeamRehome(task({ id: 'k1', process_run_id: 'run-1' }), context)
    expect(result).toEqual({ status: 'resolved', method: 'via-run', teamId: 't1' })
  })

  it('leaves a generated Task unresolved when the run is missing (never falls back to BU)', () => {
    const context = ctx({ activeTeamIdsByBu: new Map([['bu-1', ['t9']]]) }) // a BU candidate exists
    const result = classifyTaskTeamRehome(task({ id: 'k1', process_run_id: 'run-x' }), context)
    expect(result).toEqual({ status: 'unresolved', reason: 'missing-run', candidateTeamIds: [] })
  })

  it('leaves a generated Task unresolved when the run is cross-org', () => {
    const context = ctx({
      runsById: new Map([['run-1', { orgId: 'org-2', owningTeamId: 't1' }]]),
      teamsById: new Map([['t1', { orgId: 'org-2', businessUnitId: 'bu-1', archived: false }]]),
    })
    const result = classifyTaskTeamRehome(task({ id: 'k1', process_run_id: 'run-1' }), context)
    expect(result.status).toBe('unresolved')
    if (result.status === 'unresolved') expect(result.reason).toBe('cross-org-run')
  })

  it('leaves a generated Task unresolved when the run Team no longer exists', () => {
    const context = ctx({ runsById: new Map([['run-1', { orgId: 'org-1', owningTeamId: 'gone' }]]) })
    const result = classifyTaskTeamRehome(task({ id: 'k1', process_run_id: 'run-1' }), context)
    expect(result.status).toBe('unresolved')
    if (result.status === 'unresolved') expect(result.reason).toBe('missing-run-team')
  })

  it('leaves a generated Task unresolved when the run Team BU diverges from the Task BU', () => {
    const context = ctx({
      runsById: new Map([['run-1', { orgId: 'org-1', owningTeamId: 't1' }]]),
      teamsById: new Map([['t1', { orgId: 'org-1', businessUnitId: 'bu-OTHER', archived: false }]]),
    })
    const result = classifyTaskTeamRehome(task({ id: 'k1', process_run_id: 'run-1' }), context)
    expect(result.status).toBe('unresolved')
    if (result.status === 'unresolved') expect(result.reason).toBe('run-team-bu-mismatch')
  })
})

describe('classifyTaskTeamRehome — AC-802 unique-BU legacy Task', () => {
  it('resolves a legacy Task when exactly one active same-org Team exists in its BU', () => {
    const context = ctx({ activeTeamIdsByBu: new Map([['bu-1', ['only-team']]]) })
    const result = classifyTaskTeamRehome(task({ id: 'L1' }), context)
    expect(result).toEqual({ status: 'resolved', method: 'via-unique-bu', teamId: 'only-team' })
  })
})

describe('classifyTaskTeamRehome — AC-803 ambiguous/invalid stays unresolved (fail closed)', () => {
  it('leaves a zero-candidate BU unresolved', () => {
    const result = classifyTaskTeamRehome(task({ id: 'L1', business_unit_id: 'bu-empty' }), ctx())
    expect(result).toEqual({ status: 'unresolved', reason: 'no-bu-candidate', candidateTeamIds: [] })
  })

  it('leaves a multi-candidate BU unresolved and reports every candidate (never picks the first)', () => {
    const context = ctx({ activeTeamIdsByBu: new Map([['bu-1', ['t1', 't2', 't3']]]) })
    const result = classifyTaskTeamRehome(task({ id: 'L1' }), context)
    expect(result).toEqual({
      status: 'unresolved',
      reason: 'multiple-bu-candidates',
      candidateTeamIds: ['t1', 't2', 't3'],
    })
  })
})

describe('buildRehomeReport + formatRatifyLine (owner-resolution gate)', () => {
  const context = ctx({
    runsById: new Map([['run-1', { orgId: 'org-1', owningTeamId: 't1' }]]),
    teamsById: new Map([['t1', { orgId: 'org-1', businessUnitId: 'bu-1', archived: false }]]),
    activeTeamIdsByBu: new Map([
      ['bu-1', ['only-team']],
      ['bu-multi', ['a', 'b']],
    ]),
  })

  const tasks: LegacyTaskRow[] = [
    task({ id: 'k1', process_run_id: 'run-1' }), // resolved via run
    task({ id: 'L1' }), // resolved via unique BU (bu-1 -> only-team)
    task({ id: 'L2', business_unit_id: 'bu-multi' }), // unresolved multi
    task({ id: 'L3', business_unit_id: 'bu-empty' }), // unresolved zero
  ]

  it('splits deterministically resolved rows from the unresolved owner-resolution set', () => {
    const report = buildRehomeReport(tasks, context)
    expect(report.resolved.map((r) => r.taskId).sort()).toEqual(['L1', 'k1'])
    expect(report.unresolved.map((u) => u.taskId).sort()).toEqual(['L2', 'L3'])
  })

  it('preserves identifiers and reason categories for each unresolved row (audit trail)', () => {
    const report = buildRehomeReport(tasks, context)
    const l2 = report.unresolved.find((u) => u.taskId === 'L2')
    expect(l2).toMatchObject({
      taskId: 'L2',
      orgId: 'org-1',
      businessUnitId: 'bu-multi',
      reason: 'multiple-bu-candidates',
      candidateTeamIds: ['a', 'b'],
    })
  })

  it('emits a RATIFY-BEFORE-MERGE line listing every ambiguous Task when unresolved rows remain', () => {
    const report = buildRehomeReport(tasks, context)
    const line = formatRatifyLine(report)
    expect(line).toContain('RATIFY-BEFORE-MERGE')
    expect(line).toContain('L2')
    expect(line).toContain('L3')
    expect(line).toContain('multiple-bu-candidates')
  })

  it('returns null (no ratify line, enforcement may proceed) when nothing is unresolved', () => {
    const report = buildRehomeReport([task({ id: 'L1' })], context)
    expect(report.unresolved).toHaveLength(0)
    expect(formatRatifyLine(report)).toBeNull()
  })
})
