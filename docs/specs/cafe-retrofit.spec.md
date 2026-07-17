# Spec — Café Retrofit (redesign buildout Step 7)

**Status:** DRAFT for the Step-7 code + 4-lens design review battery. Per `docs/plans/CLOUD-AGENT-HANDOFF.md`
§2 the owner is deliberately absent (OD-REDESIGN-67): every genuinely-ambiguous rule is resolved to the
**most conservative, fail-closed** option and tagged `RATIFY-BEFORE-MERGE:` inline (collected in §8). A
later "no" narrows the affected clause; it never reopens closed domain law (OD-REDESIGN-1..66).

**What this step is (master plan `docs/plans/2026-07-14-redesign-buildout.md` row 7):** a **"Start today's
opening"** surface over the **existing** kitchen Module, running on **Step 6's occurrence spawner**;
occurrence Tasks flow into `/work/tasks`. Master-plan **DB/RLS column = "no"**; drill = **"Light — map
existing kitchen logs/plans onto the occurrence model."** This spec does that mapping (§2) from the
as-built code/schema and adds **no new schema beyond Step 6's** (ADR-0051 D11).

**Authority chain:** `CONTEXT.md` (Process · Process Run · Shift · PIC · Supervisor) → `docs/decisions.md`
OD-REDESIGN-5/15/58/61/66 + OD-K (kitchen Module) + OD-41 → `docs/adr/0051-occurrence-as-tasks-schema.md`
(**Step 6 = binding substrate**, esp. D6/D7/D8/D9/**D11**) → `docs/specs/occurrence-as-tasks.spec.md` +
`docs/plans/2026-07-16-occurrence-as-tasks.md` (the tables/RPCs/DAL this step **consumes**, not rebuilds) →
`docs/experience-contract.md` Rules 1–12. **JTBD oracle:** `docs/jtbd.md` — the **barista / café operator**
(J16, Scenario **S1 Café opening**) is the zero-training-obviousness front (OD-REDESIGN-66). **Mockup
authority:** `docs/design-mockups/redesign-mockups-2026-07/SALVAGE-INVENTORY.md` — the convergence flows own
the **occurrence-as-tasks surfaces** incl. the validated **F2 "Start today's opening"** journey
(verb+object; job-function provenance line; "Process Run" never shown).

**Binding as-built prior art (read from source for this spec):**
`supabase/migrations/20260620000002_ops_kitchen_plans.sql`, `…000003_ops_kitchen_logs.sql`,
`…000008_ops_kitchen_logs_rls.sql`, `…000009_ops_approve_kitchen_log_rpc.sql`, `…000001_ops_wip_items.sql`;
`mos-app/src/lib/db/kitchen-logs.ts`, `mos-app/src/pages/kitchen-log-page.tsx`,
`mos-app/src/shell/sections.tsx` (Café Module = `/cafe/*`, re-homed from `/kitchen/*`, OD-REDESIGN-15);
`mos-app/src/lib/capabilities.ts` (client capability mirror); Step-6 DAL contract
`mos-app/src/lib/db/processes.ts` + `processes.types.ts`.

---

## 1. Overview

The café's **daily opening** is already a real operational routine; today it is implicit (staff "just
open" and then log production). Step 6 built a generic occurrence runtime — a **Process** definition +
`daily` cadence → an idempotent **spawn** that materializes **owned Tasks** into `/work/tasks` under a
grouping **caption**, with **job-function → holder** PIC resolution and a fail-closed pending queue for
ambiguity. Step 7 **retrofits the café onto that runtime without touching the kitchen tables**: it seeds a
*"Café Opening"* Process, gives the Café Module a **"Start today's opening"** surface that calls Step 6's
`spawn_process_run`, and surfaces the generated opening Tasks (+ any "to assign" items) — while the existing
**production-logging** lifecycle (`ops.kitchen_logs` submit → approve → batch → ESB → Daily-Log mirror)
keeps running **unchanged** and reachable at `/cafe/log`.

**The Step-7 job sentences** (Rule 1): the café operator's *"Start today's opening and see what I have to
do."*; the shift lead's *"Two openers could own this step — you pick who."* (reused from Step 6).

### In scope
- **Seed** a *"Café Opening"* `mos.work_lines` Process (`type='process'`, BU = the café Retail-Ops BU),
  a `daily` `mos.process_cadences`, and its `mos.process_task_defs` (opening checklist) — **data only**,
  idempotent, reversible; plus a test fixture (`mos._test_seed_cafe_opening()`) for pgTAP/e2e.
- A café DAL (`mos-app/src/lib/db/cafe-opening.ts`) that resolves the Café Opening Process + reads today's
  opening run/roll-up + starts it — **reusing** Step 6's `processes.ts` (`startRun`, `listDueRuns`,
  `getRunRollup`, `listRunTasks`, `listPendingTasks`, `resolvePendingTask`).
- A **"Start today's opening"** surface (the Café Module home, `/cafe`) — capture-first, zero-training
  (OD-REDESIGN-61/66), verb+object action (Rule 7), capability-gated Start, occurrence-caption group +
  derived roll-up, pending-PIC resolution — **reusing** Step 6's `StartRunControl`/`PendingResolution` and
  the shipped Tasks grouping; the existing `/cafe/log|plan|stock|review|pushes` links stay reachable.
- Route/nav/i18n wiring; the **F2 "today's opening"** curated e2e.

### Non-goals (explicitly deferred — do NOT fail these in review)
- **Any kitchen-schema change** — no new table/column/index/RLS/RPC on `ops.kitchen_*` (NFR-701); in
  particular **no `ops.kitchen_logs.process_run_id` bridge** in v1 (§8 RATIFY-7B; ADR-0051 D11 floated it —
  deferred).
- **Restructuring production logging** — `kitchen_logs`/`kitchen_plans`/`kitchen_stock` + the approval RPC
  keep their exact lifecycle; the opening occurrence **links to**, never absorbs, them (FR-708).
- **Widening `process.start` to café `member`s** — floor members cannot start the opening in v1 (§8
  RATIFY-7A; upholds Step-6 RATIFY-5).
- **Closing / stock-opname / shift-roster Runs, Standards/Checks/evidence** (OD-REDESIGN-4/5/30/31) — later.
- **A guided Process designer** (OD-REDESIGN-13) — definitions are **seeded**, as in Step 6.
- **Auto-materialize / scheduler** — Start stays a human, idempotent act (Step-6 RATIFY-3).
- **Binding the definition to every real production branch automatically** — production adoption is
  owner-gated (§8 RATIFY-7C).

---

## 2. The kitchen → occurrence mapping (the drill — from the as-built code/schema)

Step 6 leaves the kitchen tables untouched (ADR-0051 D11); the retrofit is a **mapping**, not a merge.
Every left-column item is verified against the cited as-built source.

| Kitchen Module as-built (source) | Occurrence-model concept (Step 6) | Retrofit treatment |
|---|---|---|
| The **daily café-opening routine** — today implicit (no table; `kitchen-log-page.tsx` opens straight to production capture) | A `mos.work_lines` row `type='process'`, name **"Café Opening"**, `business_unit_id` = the café Retail-Ops BU; a `mos.process_cadences` row `cadence_kind='daily'` (ADR-0051 D1/D2) | **NEW seed data** (FR-701/709); no schema |
| **Single-operator opening steps** (unlock door, turn on espresso machine, check pastry stock, wipe bar) | `mos.process_task_defs.checklist_items` (jsonb) **inside ONE** opening Task (OD-12 / OD-REDESIGN-12) | authored in the seed |
| **Independently-owned opening steps** (e.g. *"Log today's production"*, *"Prep bar station"*) — need own PIC/due/status | **separate** `mos.process_task_defs` rows, PIC bound to a **job function** (café/opener Role + branch Team) | authored in the seed |
| **"Today's opening"** for one branch on one calendar day | one `mos.process_runs` row (`period_key` = today WIB, `owning_team_id` = branch Team; idempotent `unique(org,work_line,team,period)`) (ADR-0051 D4/D6) | Step-6 `spawn_process_run` |
| The **opener / barista on shift** | PIC resolved at spawn via `mos._function_holders(org, opener Role, branch Team)`; **0/many ⇒ pending, never guessed** (OD-41; ADR-0051 D7) | Step-6 resolver + `resolve_pending_task` |
| `ops.kitchen_plans` — daily plan qty per `(date, wip_item, action_type)`, ops_lead/admin-authored (`20260620000002`) | **UNCHANGED** — remains the production-plan variance baseline; **not** spawned by the opening | map, not merge (FR-708) |
| `ops.kitchen_logs` — Production/Transfer fact table; member inserts `Submitted`, ops_lead `approve_kitchen_log` mints batch → `kitchen_stock` → `esb_push` → `ops.log_entries` mirror (`20260620000003/000008/000009`) | **UNCHANGED** — full lifecycle preserved; a *"Log today's production"* opening **Task deep-links to `/cafe/log`**; kitchen logs do **not** carry `process_run_id` in v1 | map, not merge; **RATIFY-7B** |
| `ops.kitchen_stock` — derived end-of-day (`20260620000004`) | **UNCHANGED** | untouched |
| The approval → `ops.log_entries` **Daily-Log mirror** (`origin='kitchen'`) | **UNCHANGED** | untouched |
| Café Module screens `/cafe/log · plan · stock · review · pushes` (`sections.tsx` `CAFE_SECTIONS`, router `/cafe/*`) | Reachable & unchanged; the **`/cafe` home** now hosts *"Start today's opening"* over the Step-6 DAL | Rule 11 reuse |

**Consequence of the map:** "occurrence Tasks flow into `/work/tasks`" means the **opening checklist
Tasks** appear under the *"Café Opening · &lt;date&gt;"* caption (Step-6 grouping, no new task table);
**production `kitchen_logs` rows do not** — they continue to their Daily-Log mirror. The two are linked by a
deep-link Task, not a foreign key (RATIFY-7B).

---

## 3. Authorization (fail-closed; no new grant in v1)

Starting today's opening flows through the **Step-6** `mos.spawn_process_run`, whose gate is unchanged:
`can('process.start') AND mos.can_start_process_for_team(branch_team)` (ADR-0051 D6/D8). Step 7 adds **no
capability, RPC, or RLS policy**. The Step-7 authorization decisions:

- **Café floor `member` may NOT start the opening in v1** — `process.start` stays **ops_lead + admin**
  (upholds Step-6 RATIFY-5). The Start action renders **only** for a `process.start`-capable viewer who is
  authorized over the branch Team; a member sees today's opening **state read-only** (via the org-readable
  run + the membership-scoped `due_process_runs()`), with an **obvious, non-dead** "your shift lead starts
  today's opening" affordance — never a disabled/dead Start button (Rule 12; FR-707). **§8 RATIFY-7A.**
- **Resolving a "to assign" item** reuses `mos.resolve_pending_task` — same capability + Team gate.
- **Read visibility** is Step-6's org-readable runs/tasks (ADR-0051 D4/D9) — any café member sees today's
  opening and its Tasks, consistent with the org-readable `/work/tasks` they group.

The client capability mirror (`mos-app/src/lib/capabilities.ts`, RLS-convenience only — ADR-0020 D4) MUST
carry `process.start` for `ops_lead`+`admin` so the Start control renders; this is a Step-6 dependency —
Step 7 **ensures** it (FR-707 / §8 RATIFY-7E), it is not a new grant.

---

## 4. UI contract (thin — Rule 11 reuse; two fronts — OD-REDESIGN-66)

- **Café Module home = "Start today's opening"** (`/cafe`, replacing the bare `Navigate to /cafe/log` —
  §8 RATIFY-7D). First viewport answers the Café rail job ("Run today's café floor work — openings,
  checks, stock, shifts", Rule 1) **before configuration** (Rule 8; barista capture-first,
  OD-REDESIGN-61):
  - **Not started + capable:** one primary **"Start today's opening"** action (verb+object; **never** a
    bare "Start"/"Create" — Rule 7 / SALVAGE override #4) → calls `startRun(cafeOpeningId, branchTeam,
    todayWIB)` and reports `{created, pending}`.
  - **Not started + not capable (member):** read-only "not started yet — your shift lead starts today's
    opening" (FR-707); **no** dead/disabled button.
  - **Started:** the occurrence **caption** header (*"Café Opening · &lt;date&gt;"*) + the Step-6
    `process_run_rollup` summary (done/total · N overdue · **N to assign**) + a link into `/work/tasks`
    filtered to that caption; **"Process Run" is never rendered** (OD-REDESIGN-58 / FR-611 / SALVAGE
    override #7).
  - **"To assign" (pending):** reuse Step-6 `PendingResolution` — a `process.start`-capable viewer picks a
    candidate → `resolvePendingTask` → the Task appears under the caption. Non-capable viewers see the
    count, no resolve control.
  - The existing capture entry points **Log · Plan · Stock · Review** stay reachable from this home
    (FR-708) — unchanged screens, Rule 11.
- **Provenance line** (SALVAGE convergence-owned): where shown, a generated Task's PIC reads
  *"PIC: &lt;name&gt; — via &lt;Role&gt; ( &lt;Team&gt; )"* — reuse the Step-6/Task provenance affordance;
  do not invent a café-only one (Rule 11 / OD-REDESIGN-60).
- **Manager front (OD-REDESIGN-66):** the shift-lead/manager keeps the dense `/work/tasks` grouped view and
  the existing `/cafe/review` queue — the opening home does not remove or dumb-down those.

---

## 5. Requirements

### Functional (EARS)
- **FR-701** The system SHALL represent a café's daily opening as a Process occurrence on the Step-6
  spawner — a *"Café Opening"* `mos.work_lines` process (`type='process'`, `business_unit_id` = the café
  Retail-Ops BU) with a `daily` `mos.process_cadences` and its `mos.process_task_defs` — introducing **no**
  new table/column/index/RLS policy/RPC on `ops.kitchen_*` or elsewhere beyond Step 6 (ADR-0051 D11;
  master-plan row 7 "DB/RLS: no").
- **FR-702** WHEN an authorized viewer opens the Café Module home, the system SHALL show whether today's
  (WIB) opening for their branch Team is already started and, when not started AND the viewer is
  `process.start`-capable, SHALL offer a single **"Start today's opening"** action (verb+object; never a
  bare "Start"/"Create" — Rule 7).
- **FR-703** WHEN the viewer activates "Start today's opening", the system SHALL call
  `mos.spawn_process_run(cafe_opening, branch_team, today_WIB)` and SHALL surface the outcome (Tasks
  created + "to assign" count); a repeat activation SHALL be idempotent — no second opening, no duplicate
  Tasks (inherits FR-602 / NFR-602).
- **FR-704** The system SHALL surface the started opening's generated Tasks grouped under the occurrence
  **caption** (*"Café Opening · &lt;date&gt;"*) within the shipped `/work/tasks` grouping, and SHALL NOT
  render "Process Run" as vocabulary (OD-REDESIGN-58; inherits FR-611).
- **FR-705** WHERE an opening step's job function resolves to **zero or many** current holders, the system
  SHALL surface it as a **"to assign"** item (never a guessed Task) and SHALL let a `process.start`-capable
  human resolve the PIC via `mos.resolve_pending_task`, materializing the Task under the same occurrence
  (OD-41; inherits FR-605/606).
- **FR-706** The system SHALL materialize the opening's **single-operator** steps as **one** Task's
  checklist items and SHALL create a **separate** Task only for a step authored with its own definition
  (e.g. *"Log today's production"*) — single-operator steps never spawn extra Tasks (OD-12; inherits
  FR-608).
- **FR-707** Starting today's opening SHALL require `process.start` **and** authorization over the branch
  Team (Step-6 gate, unchanged); a café **member** lacking `process.start` SHALL see today's opening state
  **read-only** with a non-dead "your shift lead starts today's opening" affordance — **not** a disabled or
  dead Start (Rule 12). *(§8 RATIFY-7A.)*
- **FR-708** The Café Module home SHALL keep the existing kitchen capture entry points (Log · Plan · Stock
  · Review) reachable and unchanged; the opening occurrence SHALL link staff to `/cafe/log` for production
  capture and SHALL NOT alter the `kitchen_logs` submit → approve → ESB → Daily-Log lifecycle.
- **FR-709** The *"Café Opening"* definition SHALL be provided as **reversible, additive seed data**
  (resolved by stable BU/Team/Role identifiers; idempotent; a guarded no-op if it already exists),
  introducing no new table/column/RLS; binding the definition to a **real production** café branch SHALL
  remain owner-gated. *(§8 RATIFY-7C.)*
- **FR-710** The opening home SHALL show progress from the **derived** Step-6 `mos.process_run_rollup`
  (done/total, overdue, N-to-assign) with **no** stored counts (inherits FR-609).

### Non-functional
- **NFR-701** Step 7 SHALL add **no** table, column, index, RLS policy, or business RPC beyond Step 6's; it
  is **data seed + DAL + UI** only (master-plan row 7 DB/RLS "no"; ADR-0051 D11). A `SECURITY DEFINER`
  **test-only** seed fixture (revoked from `public,anon,authenticated`, DOWN-dropped) is permitted (mirrors
  `mos._test_seed_*`). Any change to `ops.kitchen_*` or a new business RPC is `RATIFY-BEFORE-MERGE`.
- **NFR-702** The Café home SHALL satisfy Experience-Contract Rule 8 (capture-first) and Rule 12
  (cold-start, scored as the least-technical café member — OD-REDESIGN-66) and SHALL reuse the shared UI
  families + Step-6 components (Rule 11 / OD-REDESIGN-60) — no one-off record editor, no duplicated Start
  control, no re-implemented Tasks table.
- **NFR-703** Coverage ≥80% changed lines; `npm run typecheck` + `npm run lint --max-warnings=0` zero;
  both review batteries (code-quality + 4-lens design, incl. the Rule-1–12 scorecard and mockup-fidelity vs
  the convergence F2 flow) recorded in `docs/reviews/<branch>.md`; `scripts/pre-merge-check.sh` exit 0.
  **security-auditor** is **not** triggered by scope (no new auth/RLS/schema path) — but IF any RATIFY here
  is resolved toward a schema/capability/RPC change, security-auditor becomes mandatory (§7).

---

## 6. Test pyramid (each AC owned by ONE test at the lowest sufficient layer)

**Sandbox note:** pgTAP runs **locally** via `bash scripts/sandbox-pg.sh` (system PostgreSQL 16 + pgTAP,
no Docker) then `sudo -u postgres pg_prove -U postgres -d gordi_mos_sandbox --host /var/run/postgresql
--ext .sql supabase/tests/<file>.sql` — **not** `supabase test db`. Unit tests run `npm test` in
`mos-app/`. The **e2e is written locally but EXECUTED via CI dispatch** (`gh workflow run integration.yml
--ref <branch>`), never against staging. AC-ids are tagged in each owning test's title so `grep -r AC-7##`
finds the proof.

### 6.1 Seed maps onto the runtime, no schema change — pgTAP
- **AC-701** (pgTAP): Given `mos._test_seed_cafe_opening()` applied, then a `mos.work_lines`
  `type='process'` *"Café Opening"* with a `daily` `mos.process_cadences` and ≥2 `mos.process_task_defs`
  exist; **and** `ops.kitchen_logs` has **no** `process_run_id` column, `ops.kitchen_plans`/`ops.kitchen_logs`
  column sets are unchanged, and no new `mos.*` occurrence table exists beyond Step 6's four (FR-701 /
  NFR-701 / RATIFY-7B).
- **AC-702** (pgTAP): Given the café-opening seed and an authorized café lead (`process.start` + active
  branch-Team member), when `mos.spawn_process_run(cafe_opening, branch_team, current_date)` is called,
  then exactly one `mos.process_runs` row exists and its single-holder opening Task(s) carry
  `process_run_id` = that run; a **second** identical call returns the same run and does not change the Task
  count (FR-703 / idempotent).
- **AC-703** (pgTAP): Given a café-opening step whose job function (opener Role + branch Team) has **two**
  holders, when the run spawns, then **no** Task is created for it and a `mos.process_run_pending_tasks` row
  (`reason='multiple'`, both candidates listed) exists; when the lead calls
  `mos.resolve_pending_task(pending, candidate)`, then a Task is materialized under the same run and the
  item is marked resolved (FR-705).
- **AC-704** (pgTAP): Given a café **member** (access_roles `['member']`, no `process.start`) who is an
  active member of the branch Team, when they call `mos.spawn_process_run(cafe_opening, branch_team,
  current_date)`, then it is **rejected** (`42501`) — floor members cannot start the opening in v1 (FR-707 /
  RATIFY-7A).
- **AC-705** (pgTAP): Given the café-opening seed where *"Open the café floor"* is authored with
  `checklist_items` and *"Log today's production"* is authored as its own def, when the run spawns as the
  lead, then the production-log step is a **separate** Task, the single-operator steps are **checklist
  items on one** Task (count matches the seed), and **no** `ops.kitchen_logs` row was created by the spawn
  (FR-706 / FR-708 / OD-12).

### 6.2 DAL + UI — unit (Vitest/RTL, mocked)
- **AC-710** (unit): Given the café DAL, when `getTodayOpeningForTeam(processId, teamId)` is called, then
  it reads `mos.process_runs` for `(processId, teamId, todayWIB)` and returns `{ started, runId, rollup }`
  (rollup from `process_run_rollup` when started, else `{ started:false, runId:null, rollup:null }`); an
  error is surfaced (FR-702 / FR-710).
- **AC-711** (unit): Given `startTodayOpening(processId, teamId)`, then it calls Step-6
  `startRun(processId, teamId, todayWIB)` and returns the `SpawnResult`; an RPC error is re-thrown (FR-703).
- **AC-712** (unit): Given the Café home, when the viewer is `process.start`-capable and today's opening is
  not started, then a single control whose accessible name is exactly **"Start today's opening"** renders
  (never a bare "Start"/"Create") and activating it calls `startTodayOpening` (FR-702 / Rule 7).
- **AC-713** (unit): Given the Café home, when the viewer LACKS `process.start` and today's opening is not
  started, then **no** actionable/disabled Start button renders; instead a read-only "your shift lead
  starts today's opening" state renders (FR-707 / Rule 12).
- **AC-714** (unit): Given the Café home after the opening is started, then it renders the occurrence
  **caption** header with the `process_run_rollup` summary (done/total · overdue · N to assign) and a link
  into `/work/tasks` for that caption, and the string **"Process Run" is never rendered** (FR-704 / FR-710
  / FR-611).
- **AC-715** (unit): Given the Café home with a `reason='multiple'` "to assign" item, when a
  `process.start`-capable viewer selects a candidate, then Step-6 `resolvePendingTask(id, picId)` is called
  (via the reused `PendingResolution`); when the viewer lacks `process.start`, the resolve control is absent
  (FR-705).
- **AC-716** (unit): Given the Café home, then the existing capture entry points **Log · Plan · Stock ·
  Review** are present as links to `/cafe/log|plan|stock|review`, preserving the kitchen lifecycle (FR-708).

### 6.3 End-to-end — Playwright (the curated **F2 "today's opening"** journey; executed via CI dispatch)
- **AC-720** (e2e): **F2.** Given an authorized café shift-lead (a fixture user with `process.start` +
  branch-Team membership), when they open the Café Module home and activate **"Start today's opening"**,
  then the opening's single-holder Tasks appear in `/work/tasks` grouped under the *"Café Opening ·
  &lt;today&gt;"* caption; an ambiguous barista step appears as **"N to assign"** and, once resolved to a
  PIC, appears as a Task in the same group; and the *"Log today's production"* Task deep-links to
  `/cafe/log` (the existing, unchanged capture screen) — the real cross-stack flow across the Step-6 spawn
  RPC + RLS + the Tasks view + the untouched kitchen Module. "Process Run" appears nowhere. *(F2 may not
  regress — standing acceptance, master plan.)*

---

## 7. Security review scope (conditional)

By scope Step 7 adds **no** auth/RLS/schema/RPC path — the privileged spawn seam is **Step 6's**, already
audited there (occurrence spec §7). **security-auditor is therefore not triggered by Step 7 as specified.**
It becomes **mandatory** if review resolves any RATIFY toward a change: RATIFY-7A (a new `cafe.open`
capability / member grant), RATIFY-7B (a `ops.kitchen_logs.process_run_id` bridge + its RLS), or any new
RPC. In that event the auditor MUST cover the new grant's least-privilege posture (no `member`
self-assignment), the new column's org-wall + cascade guard, and that the café surface cannot be used to
spawn/resolve across orgs. The Café **seed** must be verified to plant same-org rows only (BU/Team/Role all
resolved within `shared.current_org_id()`), never a cross-org PIC.

---

## 8. RATIFY-BEFORE-MERGE (owner must ratify each)

- **RATIFY-7A — Café floor `member` starting the opening** *(the decision Step-6 RATIFY-5 deferred to
  here).* **Recommend (conservative, chosen):** **NO** — `process.start` stays **ops_lead + admin**; the
  Start action is capability-gated; members see read-only state + a non-dead "shift lead starts it"
  affordance. **Alt (Option B, JTBD-preferred, deferred):** register a **narrow** `cafe.open` capability
  granted to members active on a café branch Team, gating **only** the café-opening spawn — this serves the
  barista-opener JTBD (J16/S1) but **requires a new capability + an RPC/gate change** (a schema/RLS path →
  violates NFR-701 no-schema and triggers §7). Because the owner is absent and the change is not additive,
  **v1 upholds ops_lead+admin**; flag Option B as the single most important café ratification.
- **RATIFY-7B — No kitchen-schema bridge.** **Recommend (chosen):** do **NOT** add
  `ops.kitchen_logs.process_run_id` in v1 (master-plan row 7 DB/RLS "no"; brief "no new schema"). The
  opening occurrence and production logging link only via a deep-link Task. **Alt (ADR-0051 D11 literal,
  deferred):** a nullable `process_run_id` on `kitchen_logs` so an approved production log surfaces under
  the opening caption — a later slice with owner sign-off + a same-org cascade guard + security-auditor.
- **RATIFY-7C — Definition rollout.** **Recommend (chosen):** ship the *"Café Opening"* definition as a
  **dev/test seed** (idempotent, guarded, resolved by stable code) for the demo + e2e; **auto-binding real
  production branch Teams/roles is owner-gated** (staging holds real data — CLOUD-AGENT-HANDOFF §3). **Alt:**
  a production data migration inserting the real branch bindings now — deferred to owner.
- **RATIFY-7D — Café home routing/IA.** **Recommend (chosen):** make **`/cafe`** render the Café
  Operations home hosting *"Start today's opening"* (replacing the bare `Navigate to /cafe/log`); existing
  `/cafe/log|plan|stock|review|pushes` unchanged. Serves the Rule-1 Café job first. **Alt:** keep
  `/cafe` → `/cafe/log` and add `/cafe/opening` as a sibling. Minor; recommend the home.
- **RATIFY-7E — Client capability mirror.** **Recommend (chosen):** ensure `process.start` is present in
  `mos-app/src/lib/capabilities.ts` `ROLE_CAPABILITIES` for `ops_lead`+`admin` so the Start control renders
  (a Step-6 dependency; no new grant — mirrors the DB seed). If Step 6 already added it, this is a verify
  no-op.
- **RATIFY-7F — Process resolution seam.** **Recommend (chosen):** the DAL resolves the *"Café Opening"*
  process by **name + café BU** (org-scoped by RLS), mirroring how kitchen resolved its BU before a stable
  `code` existed. This is a known fragility (a rename breaks it). **Alt (deferred):** add a stable
  `work_lines.code`/`slug` in a later slice for durable process resolution — recommend that follow-up.

---

## 9. Open follow-ups (tracked, not Step 7)
- Café **closing** + **stock-opname** + **shift-roster** Runs on the same spawner (OD-REDESIGN-5); the
  `cafe.open` capability (RATIFY-7A Option B); the `kitchen_logs.process_run_id` bridge (RATIFY-7B);
  production adoption of real branch definitions (RATIFY-7C); a stable `work_lines.code` (RATIFY-7F).
- Standards/Checks/evidence for opening steps (OD-REDESIGN-4/30/31); Roastery + Ecommerce module retrofits
  on the same runtime (the map generalizes).
