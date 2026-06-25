# ADR-0015 — Cascade naming: Project/Process pair, `mos.work_lines`

- Status: Accepted (2026-06-24)
- Deciders: Owner (Arief) + Director
- Related: ADR-0014 (cascade foundation + its 2026-06-24 simplification amendment); OD-C-1; `CONTEXT.md` § Cascade; resolves the "pending Q1" naming left open by `docs/plans/2026-06-23-cascade-foundation.md`.

## Context

ADR-0014 locked the model but left the layer-4 entity's physical name open (eng-planner recommended `mos.work_lines` vs `mos.projects_processes`, "blocking Q1"). The first slice shipped (PR #69) using one set of names; the spec (`docs/specs/cascade-foundation.spec.md`) was drafted earlier against a heavier model that called the entity "Initiative" with `mos.initiatives` / `program_process_id`. That drift needs a single recorded resolution so test/AC ids and code agree.

## Decision

The layer-4 work entity is the **Project/Process pair** — **no umbrella term** ("Initiative" is dropped). Canonical physical names, now shipped on `main`:

- lookup table **`mos.work_lines`** with `type ∈ {project, process}` (chosen over `mos.projects_processes` — neutral, reads for both types, shorter)
- lookup table **`mos.objectives`**
- bridge column **`mos.tasks.work_line_id`** (and `mos.tasks.objective_id`), nullable, additive (ADR-0014 topology)

Everywhere the spec still says *Initiative* / `mos.initiatives` / `program_process_id`, read **work-line / `mos.work_lines` / `work_line_id`**. The spec's heavier FRs (the `person_workload` SECURITY DEFINER RPC, per-layer Accountable/Responsible, `lane` in the UI, the standalone Workload page) are **deferred (v2)** — they describe ADR-0014's eventual end-state, not the shipped v1; they are additive when wanted.

## Consequences

- `grep` for a behavior resolves to one name; no Initiative/work-line fork.
- The spec is annotated (banner) rather than fully rewritten — a full in-body rewrite is unnecessary churn now that the names are locked and the v1/v2 split is recorded here.
- If the deferred layers are built, they extend `mos.work_lines`/`mos.objectives` and add tables/columns additively — no rename.
