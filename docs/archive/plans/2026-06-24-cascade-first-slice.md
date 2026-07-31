# Plan — Cascade first slice (simplified, task-centric)

- Date: 2026-06-24 · Branch: `intake/cascade-foundation` (PR #69)
- Spec: `docs/specs/cascade-foundation.spec.md` (v1 scope = this plan; RPC / per-layer A/R / lane UI **deferred**)
- Decisions: ADR-0014 (additive topology) + OD-C-1 + owner course-correct 2026-06-24 (literacy bar NFR-206)
- Supersedes the heavy `2026-06-23-cascade-foundation.md` (3-table + RPC + per-layer A/R) — see its header.

## Model (owner's)
`mos.tasks` + two nullable FK fields (`objective_id`, `work_line_id`) = the whole bottom-up attribution.
Two tiny **lookup** tables feed canonical pickers (stop free-text fragmenting the rollup). The only
must-have distinction is **project vs process** (`work_lines.type`). NO lane in the UI, NO RPC, NO
per-layer A/R. Workload = group the Tasks list by work-line + filter by person (D1) + a plain summary
caption (D2). Standalone surface (D3) deferred.

## Task A — migration + RLS + seed (implementer, TDD/pgTAP)
New `supabase/migrations/20260624000001_mos_cascade_lookups.sql`:
- `mos.objectives` (id, org_id default `shared.current_org_id()`, name `check btrim<>''`, archived_at, timestamps, `set_updated_at` trigger).
- `mos.work_lines` (… same … + `type text not null check (type in ('project','process'))`).
- `alter table mos.tasks add column objective_id uuid references mos.objectives(id)`; same for `work_line_id` → `mos.work_lines(id)` (nullable, no backfill — ADR-0014). Indexes on both.
- Same-org guard `mos._guard_task_cascade_refs()` BEFORE INSERT/UPDATE on `mos.tasks`: if `objective_id`/`work_line_id` set, the referenced row's `org_id` must equal `new.org_id`, else `raise 42501` (NFR-201). FK alone doesn't enforce org.
- RLS on both lookups: `grant select,insert,update to authenticated`; enable+force. SELECT org-readable (`org_id = shared.current_org_id()`). INSERT/UPDATE = `shared.has_access_role('admin') or shared.has_access_role('ops_lead')` (catalog management; manager is not a DB claim — setting a task's work-line is governed by the existing `tasks_update_editor`/`can_edit_task`, unchanged).
- Reversible (DOWN drops cols + tables + trigger/fn).
- Dev seed (`seed.dev-tasks.sql`): 2–3 objectives + the designer canon work-lines (Daily IG Content=process; New Menu Design, Brand Refresh=project), and set `work_line_id`/`objective_id` on a few existing dev tasks.
- pgTAP `supabase/tests/`: same-org read / cross-org denied (both lookups); member INSERT denied, ops_lead allowed; `type` CHECK rejects bad value (AC-211); same-org guard rejects a task pointing at another org's work-line; task round-trips with both FKs set.
- Verify: `supabase db reset` then `supabase test db`; `supabase db lint`.

## Task B — data layer (implementer, TDD/Vitest)
- `mos-app/src/lib/db/objectives.ts`: `listObjectives()` → `{id,name}[]` (org-readable, archived_at null, name asc).
- `mos-app/src/lib/db/work-lines.ts`: `listWorkLines()` → `{id,name,type}[]`.
- `tasks.ts`: add `objectiveId?`/`workLineId?` to `CreateTaskInput` + `createTask` insert; extend `TaskFieldsPatch` Pick with `'objective_id'|'work_line_id'` (so `updateTaskFields` sets/clears them — set→`field_edited` event, already wired).
- `tasks.types.ts`: add `objective_id: string | null`, `work_line_id: string | null` to `TaskListRow`.
- Unit tests (mocked supabase): list shape; createTask sends both ids; updateTaskFields clears (null) and sets.
- Verify: `npm test -- objectives work-lines tasks`; `npm run typecheck`.

## Task C — D1 Tasks list (ui-implementer, TDD/RTL) — depends on B
- `tasks-table-body.tsx`: add **Work-line** (name + `project|process` text tag, never color-only) and **Objective** columns; client-side name resolution from `listObjectives`/`listWorkLines` (the `directory.ts` pattern — no cross-schema embed).
- `task-surface.tsx`: a **"Group by: work-line"** toggle (opt-in); when on, render group headers (work-line name + type tag) with tasks beneath; keep the person filter. When grouped AND filtered to one person, show a plain **summary caption**: `"{first name}'s work: N projects and M daily jobs."` (D2's win, FR-234 self = "Your work: …").
- DESIGN.md tokens only; One-Blue; dense ≥768 → cards <768; WCAG-AA; NFR-206 plain words.
- Unit tests: columns render resolved names + type tag; group-by nests rows under work-line; caption counts projects vs processes; ungrouped unchanged.
- Verify: `npm test -- task-surface tasks-table-body`; `npm run lint`.

## Task D — editor pickers (ui-implementer, TDD/RTL) — depends on B, ∥ C
- Task create + detail: **Objective** + **Work-line** dropdowns (from `listObjectives`/`listWorkLines`), set + clear ("— none —"); write via `createTask` / `updateTaskFields`. Plain labels.
- Unit tests: picker lists options; selecting writes the id; clearing writes null.
- Verify: `npm test -- task-create task-detail`; `npm run lint`.

## Close-out (Director)
Review (spec + code-quality; design-review on C/D render), full gates (`typecheck`, `lint --max-warnings=0`, `npm test`, `supabase test db`), live-verify every new query against local 44321 (the log_date lesson), then merge PR #69 to main.
