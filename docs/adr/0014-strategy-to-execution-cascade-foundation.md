# ADR-0014 — Strategy-to-Execution cascade: foundation now, layers additive

- Status: Accepted (2026-06-23, grill-with-docs session #3)
- Deciders: Owner (Arief) + Director
- **Amendment (2026-06-24, owner):** v1 build is simplified within these same principles — the layer-4
  entity is realized as a **lookup table per the Project/Process pair** (`mos.objectives`,
  `mos.work_lines{type}`) + two **nullable FK fields on `mos.tasks`**, not a rich per-layer-A/R entity.
  Workload is **group-by + filter on the Tasks list** (D1) + a plain caption (D2), **not** a SECURITY
  DEFINER RPC. Lane is omitted from the UI (literacy bar, spec NFR-206). Topology (#3) and additivity
  (#4/#5) are unchanged — the RPC and per-layer A/R remain valid *deferred* end-states, additive when
  wanted. Active plan: `docs/plans/2026-06-24-cascade-first-slice.md`.
- Related: ADR-0003 (cascade-ready task entity — this **supersedes its "no higher-cascade tables"
  deferral**, §3, while keeping its additive-FK principle); vault `Strategy-to-Execution Stack` /
  `Management OS Framework` / `Notion Management OS`; `CONTEXT.md` § Cascade; OD-DIR-7 (first-slice scope)

## Context

The first slice shipped Tasks + lightweight RACI; in use it reads as *a task manager with RACI as the
highlight*. The owner's actual intent is the **MOS hierarchy as the spine**: tie project-based work and
daily recurring work to the goals they serve, so a person's effort split is visible — e.g. *is the
designer tied up in daily IG content or the new-menu project?* The wiki names the core pain this solves:
*"everything runs through me"* → visibility enables delegation (`Management OS Framework`).

The vault locks the model (`Strategy-to-Execution Stack`, from the 2026-05-02 ChatGPT session captured at
`sources/260502-chatgpt-full-conversation-transcript-context-business-hier.md`):

```
Strategy → Objective → Outcome → Program/Process → Output → Task
```

across three lanes (Run/BAU · Optimize · Transform), with **A/R ownership per layer**. Two tensions were
resolved in this session:

1. **Layer 4: Project vs Program/Process** — both wiki pages left this "pending Arief's declaration."
2. **Lay foundation without a later rebuild vs YAGNI** — the owner wants the structure to grow into
   without refactor, *and* not to pre-build empty machinery.

The dormant Notion MOS prototyped the pieces (Objectives, Project, Tasks, Timesheet, People-load) but was
never populated. The Teable model kept levels 1–5 in **one** self-referential table + a Tasks table to
stay lean — a rationale that does **not** transfer to Postgres (typed columns, FK integrity, per-table
RLS, and additive migrations invert the trade-off; a single levels-1–5 table forces sparse columns, a
`level` discriminator doing too much, and a self-FK cycle guard — the `is_manager_of` trap, ADR-0001).

## Decision

1. **Lock layer 4 = Program/Process.** One entity — working name **Initiative** (owner to confirm) — with
   a `type ∈ {Program, Process}`. The single "Project" shape is superseded. **Program** = bounded,
   time-boxed change work (Transform/Optimize); **Process** = standing, recurring run work (BAU), never
   "done," emits Outputs.

2. **Adopt the full six-level model as canonical vocabulary** (`CONTEXT.md`), but **build only the three
   layers the effort-split lens populates now**: `objective`, `program_process` (Initiative), `task`
   (exists). Strategy, Outcome, Output stay vocabulary-only. Rationale for not collapsing to 3 levels in
   the *model*: a 3-level model fuses aspiration≠measurement (Objective≠Outcome) and work-system≠artifact
   (Program/Process≠Output) — and the second cut is exactly what makes recurring/BAU work trackable (a
   Process never closes; its Outputs do).

3. **Topology rule — additive, never inserted-between.** A Task attaches **directly and permanently** to
   an Initiative (its cascade parent). When Output is built later it is an **optional side-grouping that
   also belongs to the Initiative** — never a mandatory link between Task and Initiative. So Output ships
   as `CREATE TABLE output` + a nullable `task.output_id`, with **zero re-pointing** of the Task→Initiative
   link. This single decision is what makes the "no rebuild later" guarantee hold.

4. **Lay foundation in shape, not in empty tables.** Build the new tables now to the *full* model's shape:
   UUID PK + `org_id` + snake_case; **A/R ownership columns on every cascade table** (the wiki's
   per-layer ownership — designed in, never retrofitted, so RACI stops being a special case); `type`
   (Program|Process) + `lane` (Run|Optimize|Transform) discriminators; nullable `objective_id` on the
   Initiative; nullable `program_process_id` on Task; nullable `parent_objective_id` on `objective`
   (Strategy/Outcome fold in as the same self-similar shape — unused now, so **no cycle guard yet**); RLS
   on every new table.

5. **Each deferred layer lands as its own additive issue** — `CREATE TABLE` + nullable `ADD COLUMN`, no
   reshape, no hot-table backfill. This generalizes (and supersedes the deferral clause of) ADR-0003 §3.

## Consequences

- **Positive:** the cascade spine + person-load lens are buildable now; the project-vs-daily split is
  first-class via `Initiative.type` + `lane`; RACI recedes to one instance of uniform A/R ownership;
  future layers are additive *by construction* (the "no rebuild" guarantee rests on decision #3).
- **Positive:** matches ADR-0003's already-proven additive path (Task shipped flat; cascade unblocked;
  zero rebuild needed).
- **Negative / accepted:** until Output exists, first-slice load is measured by **task/initiative count
  per lane**, not by weekly Outputs (the truer unit). Accepted as the v1 proxy; **Output is the
  designated next layer.** This is the live half of the unresolved "measure of load" question
  (structural-count now; weekly-Output and/or duration later).
- **Negative / accepted:** the upper measurement layer (Outcome) is vocabulary-only and may drift from
  the eventual table until built.
- **Resolved (Daily Log ↔ Process):** the Daily Log is **not** folded into the cascade. It stays the
  factual "it happened" feed (owner-less by definition; the kitchen mirror writes facts, not
  assignments). Person-load reads from **assigned recurring work** — the **Process** a person is R/A on
  (e.g. an "IG Content" Process) and its recurring Tasks — never from log entries. The two only
  cross-link via the existing Task follow-up seam. Consequence: the first slice is purely additive and
  touches neither `ops.log_entries` nor the kitchen mirror.
- **Watch:** (a) entity name **Initiative** is provisional — owner may prefer Program/Process-as-pair;
  (b) the umbrella stack name is unlocked.
