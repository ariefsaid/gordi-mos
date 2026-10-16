// Team-context seam (V3 Issue 8 — Café canonical records + executing-Team re-home).
// Pure, DB-free logic: the honest zero/one/multiple Team resolver (AC-V3-007), the deterministic
// BU->Team re-home classifier + owner-resolution ratify gate (AC-801/802/803), the read-time
// Task->Team normalization that feeds the Issue 5 RecordViewer adapter, and the Team-keyed
// filter/grouping projections the Issue 6 RecordCollection Task adapter consumes.
//
// Integration points (implemented against dependency plans, not their landed code):
//   - Issue 5 RecordViewer: toViewerTeam(view) -> createTaskRecordAdapter({ team }) input.
//   - Issue 6 RecordCollection: filterTasksByTeam / groupTaskIdsByTeam -> Tasks CollectionAdapter.
//   - Café/Work DAL: resolveTeamContext + filterEffectiveMemberships replace due[0]/myTeams[0].


export {  resolveTeamContext } from './eligible-teams'


export { deriveTaskTeamView,  } from './task-team-view'
export type { TaskTeamView,  } from './task-team-view'


