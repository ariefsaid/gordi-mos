// Deterministic BU->Team re-home classification (V3 Issue 8, AC-801/802/803 of FR-V3-003 /
// NFR-V3-008/009). DB-free reference implementation of the rules the forward migration's
// mos._rehome_task_teams() maintenance function must apply in a single transaction.
//
// This module owns the ONE thing the plan flags as a genuine data decision: a legacy Task that
// cannot be resolved deterministically is left honestly UNRESOLVED with a reason category. It is
// NEVER assigned by first-row, primary flag, Team name order, membership, or a BU-as-Team label.
// The unresolved set is the owner-resolution gate — see formatRatifyLine + the report's
// RATIFY-BEFORE-MERGE handoff.

/** The subset of a legacy mos.tasks row the re-home needs. Legacy columns keep their storage names;
 *  business_unit_id is the compatibility projection that must end up equal to the chosen Team's BU. */
export interface LegacyTaskRow {
  id: string
  org_id: string
  business_unit_id: string
  /** Set only on occurrence Tasks materialized by spawn/resolve; null for ad-hoc legacy Tasks. */
  process_run_id?: string | null
}

interface RunRef {
  orgId: string
  owningTeamId: string
}

interface TeamRef {
  orgId: string
  businessUnitId: string
  archived: boolean
}

/** Authoritative lookups for classification. `activeTeamIdsByBu` holds only same-org, non-archived
 *  Teams keyed by BU (the caller builds it from shared.teams filtered to the Task's org). */
export interface RehomeContext {
  runsById: Map<string, RunRef>
  teamsById: Map<string, TeamRef>
  activeTeamIdsByBu: Map<string, string[]>
}

/** Why a legacy Task could not be resolved deterministically. Each maps to a migration-report
 *  reason category and to an explicit owner decision before final NOT NULL enforcement. */
export type RehomeUnresolvedReason =
  | 'missing-run' // process_run_id set but the run row is gone
  | 'cross-org-run' // the run belongs to another org (data anomaly)
  | 'missing-run-team' // the run's owning Team no longer exists
  | 'run-team-bu-mismatch' // the run Team's BU diverges from the Task's BU
  | 'no-bu-candidate' // ad-hoc Task, zero active same-org Teams in its BU
  | 'multiple-bu-candidates' // ad-hoc Task, more than one valid Team in its BU

export type RehomeClassification =
  | { status: 'resolved'; method: 'via-run' | 'via-unique-bu'; teamId: string }
  | { status: 'unresolved'; reason: RehomeUnresolvedReason; candidateTeamIds: string[] }

/**
 * Classify one legacy Task against the deterministic re-home rules. Fail-closed: any Task carrying
 * a process_run_id that does not resolve cleanly stays unresolved (it does NOT fall through to the
 * BU path), because a broken occurrence provenance deserves explicit human resolution, not a guess.
 */
export function classifyTaskTeamRehome(
  task: LegacyTaskRow,
  ctx: RehomeContext,
): RehomeClassification {
  // Rule 1: occurrence Task -> its run's owning Team, when everything lines up same-org + BU-equal.
  if (task.process_run_id) {
    const run = ctx.runsById.get(task.process_run_id)
    if (!run) return { status: 'unresolved', reason: 'missing-run', candidateTeamIds: [] }
    if (run.orgId !== task.org_id) {
      return { status: 'unresolved', reason: 'cross-org-run', candidateTeamIds: [] }
    }
    const team = ctx.teamsById.get(run.owningTeamId)
    if (!team) return { status: 'unresolved', reason: 'missing-run-team', candidateTeamIds: [] }
    if (team.orgId !== task.org_id) {
      return { status: 'unresolved', reason: 'cross-org-run', candidateTeamIds: [] }
    }
    if (team.businessUnitId !== task.business_unit_id) {
      return {
        status: 'unresolved',
        reason: 'run-team-bu-mismatch',
        candidateTeamIds: [run.owningTeamId],
      }
    }
    return { status: 'resolved', method: 'via-run', teamId: run.owningTeamId }
  }

  // Rule 2: ad-hoc legacy Task -> the sole active same-org Team in its BU, only when unique.
  const candidates = ctx.activeTeamIdsByBu.get(task.business_unit_id) ?? []
  if (candidates.length === 0) {
    return { status: 'unresolved', reason: 'no-bu-candidate', candidateTeamIds: [] }
  }
  if (candidates.length > 1) {
    return {
      status: 'unresolved',
      reason: 'multiple-bu-candidates',
      candidateTeamIds: [...candidates],
    }
  }
  return { status: 'resolved', method: 'via-unique-bu', teamId: candidates[0] }
}

export interface RehomeResolvedRow {
  taskId: string
  teamId: string
  method: 'via-run' | 'via-unique-bu'
}

export interface RehomeUnresolvedRow {
  taskId: string
  orgId: string
  businessUnitId: string
  processRunId: string | null
  reason: RehomeUnresolvedReason
  candidateTeamIds: string[]
}

export interface RehomeReport {
  resolved: RehomeResolvedRow[]
  unresolved: RehomeUnresolvedRow[]
}

/** Classify a whole batch, splitting deterministically resolved rows from the unresolved
 *  owner-resolution set. The unresolved rows carry enough identifiers to seed the migration's
 *  mos.task_team_rehome_ambiguities audit table. */
export function buildRehomeReport(
  tasks: readonly LegacyTaskRow[],
  ctx: RehomeContext,
): RehomeReport {
  const resolved: RehomeResolvedRow[] = []
  const unresolved: RehomeUnresolvedRow[] = []
  for (const task of tasks) {
    const c = classifyTaskTeamRehome(task, ctx)
    if (c.status === 'resolved') {
      resolved.push({ taskId: task.id, teamId: c.teamId, method: c.method })
    } else {
      unresolved.push({
        taskId: task.id,
        orgId: task.org_id,
        businessUnitId: task.business_unit_id,
        processRunId: task.process_run_id ?? null,
        reason: c.reason,
        candidateTeamIds: c.candidateTeamIds,
      })
    }
  }
  return { resolved, unresolved }
}

/**
 * The owner-resolution gate. When any legacy Task is unresolved, final NOT NULL enforcement of
 * mos.tasks.team_id must NOT proceed until the owner ratifies an explicit Task->Team mapping. This
 * returns the exact ledger line the implementation must surface; null means the batch is fully
 * resolved and enforcement may proceed.
 */
export function formatRatifyLine(report: RehomeReport): string | null {
  if (report.unresolved.length === 0) return null
  const items = report.unresolved
    .map((u) => `${u.taskId} (${u.reason}${u.candidateTeamIds.length ? ` -> ${u.candidateTeamIds.join('|')}` : ''})`)
    .join(', ')
  return `RATIFY-BEFORE-MERGE: ambiguous legacy Task-to-Team mappings need owner resolution — ${items}`
}
