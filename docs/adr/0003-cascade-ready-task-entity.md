# ADR-0003 — Cascade-ready task entity (flat now, additive bridge later)

- Status: Accepted (2026-06-11, grill-with-docs session #2)
- Deciders: Owner (Arief) + Director
- Related: OD-DIR-7 (first-slice scope), OD-P2-1..9 (`docs/decisions.md`), the
  Strategy-to-Execution Stack (wiki: Strategy → Objective → Outcome → Program/Process → Output → Task)

## Context

Gordi's long-term Management OS is a six-layer cascade. The first slice deliberately builds only the
bottom layer — the **Task** (OD-DIR-7) — plus lightweight RACI, weekly updates, and ops events. The
binding product constraint is that the larger MOS must *grow into* this without a rewrite.

During P2-1 intake the owner asked whether subtasks and the bridge from a task up to Outcomes /
Objectives / Goals should exist now. Two facts shaped the answer:

1. **You cannot foreign-key to a table that does not exist.** A task's upward link to an `Output` or
   `Objective` requires those tables — which are exactly the deferred scope. Building the bridge now
   means building the higher cascade layers now.
2. **In Postgres, adding a nullable FK column to an existing table is a trivial, additive, zero-
   downtime migration.** Nothing about a clean task table blocks a future `contributes_to_output_id`.

Subtasks were resolved (OD-P2-7) as **lightweight checklist items**, not nested tasks — so the unit
that bridges into the cascade is unambiguously the **Task**, not a checklist row or a task subtree.

## Decision

1. **The Task is the cascade-bridgeable unit.** `mos.tasks` has a stable UUID identity, the `org_id`
   seam, and snake_case columns — it is shaped so any future parent reference is purely additive.
2. **Build flat now.** No `parent_task_id` self-relation, no higher-cascade tables, no upward FK in
   P2-1. Subtasks ship as `mos.task_checklist_items` (a label/done/order child of a task).
3. **Fix the forward-migration path (not the code).** When the cascade layers are built (a later
   phase), the bridge lands as additive nullable FKs on `mos.tasks`, e.g.:
   - `output_id uuid references mos.outputs(id)` — a task contributes to a weekly Output, and the
     Output chains up to Program/Process → Outcome → Objective → Strategy.
   - (Optionally a denormalized `objective_id` later if query paths demand it — additive too.)
   These columns are nullable: pre-cascade tasks simply have them unset, so no backfill is forced.
4. **The lane/Type partition** (Run/Optimize/Transform; Program vs Process/SWP — Strategy-to-Execution
   Stack) is a *higher-layer* concern, not a task column in v1. If a task-level `type`/`lane` tag is
   ever wanted, it is again an additive nullable column — out of scope here.

## Consequences

- **Positive:** P2-1 ships a usable daily tool fast; the cascade is unblocked, not pre-built; the
  most expensive-to-reverse thing (the core entity's identity/shape) is settled conservatively.
- **Positive:** future cascade work is a sequence of additive migrations + new tables, each its own
  issue — no reshaping of `mos.tasks`, no data backfill on the hot table.
- **Negative / accepted:** tasks cannot be rolled up to objectives until the higher layers exist;
  cross-layer reporting waits. This is the deferral OD-DIR-7 already accepted.
- **Watch:** if real usage shows tasks need true nesting (a task under a task, not a checklist),
  revisit — `parent_task_id` is itself an additive nullable self-FK, but it pulls in tree RLS + a
  cycle guard (see the `is_manager_of` cycle lesson, ADR-0001/migration 0004). Not free; not now.
