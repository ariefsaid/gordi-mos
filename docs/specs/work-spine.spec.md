# Spec — Work spine v1: objective→task cascade as an everyone-surface

- Status: **Accepted** — owner sign-off 2026-07-06 (OD-WS-1). §7 resolved: (a) org-wide read ·
  (b) new `/work/cascade` route, `/objectives`+Projects&Processes become capability-gated manage mode ·
  (c) inline Manage affordance to existing catalog pages · (d) RLS-premise reframe acknowledged (read
  already org-scoped; migrate WRITE to `can()`) · (e) **minimal `shared.can()` lands this slice** ·
  (f) `workline.manage` scope = `org` for v1.
- Source decisions: **ADR-0019 D2 / D8 / D12 / D14-step-3** (IA north-star: the Work row,
  phone-first, bilingual, sequencing) · **ADR-0020** (capability authorization `can()` — the Work
  spine is the named *first consuming module*, D4/D6) · **ADR-0021** (i18n catalog seam) ·
  **ADR-0014 / ADR-0015** (cascade foundation + Project/Process naming lock)
- Vocabulary: `CONTEXT.md` § Cascade · § Surfaces (Home, Work, My Week) · § People & structure
  (Business Unit, Access role, Capability via ADR-0020)
- Extends (does **not** duplicate or contradict):
  - `docs/specs/cascade-foundation.spec.md` — the objective / work_line / task tables + the
    person-load view (FR-200..236, NFR-200..206, AC-200..234). This slice cites those ids.
  - `docs/specs/cascade-catalog.spec.md` — the admin/ops_lead catalog *management* surfaces
    (FR-001..022, NFR-001..005, AC-001..020). This slice makes those surfaces the **manage mode**
    reachable from the everyone cascade view.

> **Author's note on the task's stated RLS premise (read §6 + §7-d before building).** The intake
> brief asserts "objectives/work_lines are admin-only today — spec the change to everyone-read."
> The shipped migration (`20260624000001_mos_cascade_lookups.sql`) already grants **SELECT to any
> authenticated org member** (`objectives_select_org` / `work_lines_select_org`, `using (org_id =
> shared.current_org_id())`), and pgTAP **AC-212** already proves a `member` session reads its org's
> rows. The admin-only-ness is at the management **page/nav** (`RequireAccessRole`) and the **WRITE**
> policies (objectives = admin only per OD-C-2; work_lines = admin|ops_lead). So the load-bearing RLS
> work for *this* slice is (i) building the everyone **VIEW** over already-readable data, and
> (ii) migrating the **WRITE** policies to `shared.can()` per ADR-0020 (Work spine = first consumer).
> Flagged for owner sign-off in §7-d; the spec below reflects this verified reality, not the brief's
> wording.

## 1. Overview & JTBD

Today the cascade (Objective → Project/Process → Task) is visible to people only as **fragments**: a
task's Project/Process + Objective pickers in the task editor, the group-by-Project/Process mode inside
the Tasks DB-view, and the per-person Workload caption. The catalogs themselves are managed on two
admin/ops_lead pages (`Objectives`, `Projects & Processes`) that a plain member never sees. There is no
single surface where **everyone** can read "what we are working toward, and where my work ladders up."

This slice (ADR-0019 D14 step 3) adds that surface: a **Work-destination cascade view** where every
authenticated org member sees the objective → work_line → task ladder (READ), and can see where their
own tasks ladder up (line-of-sight). The existing admin objectives-page becomes the **manage mode** —
reachable from the cascade view, gated by capability. It **elevates** the shipped Tasks DB-view
cascade machinery (group-by-work_line headers, the work-line type tag, the Workload caption, the
`useCascadeCatalogs` loader, the `db/objectives` + `db/work-lines` data layers) into an everyone
surface; it does **not** rebuild the tasks table, the task editor, or the cascade catalog tables.

**Primary JTBD** (extends `CONTEXT.md` "everything runs through me" from managers to everyone): *as any
org member, see how the work I am responsible for connects to the goals the org set, without asking a
manager.* The cascade view answers one plain question — "where does my/our work ladder up?" — at a
glance, phone-first.

**Quality bar = the shipped Tasks DB-view** (`mos-app/src/components/tasks/tasks-workspace.tsx`): dense
grouped table on desktop, grouped cards on phone, hairline group headers, optimistic + empty/error
states, keyboard layer, DESIGN.md tokens. The cascade view inherits that grammar.

**Measure (v1):** structural line-of-sight, not KPI roll-ups — "can every member trace their open
tasks up to a Project/Process and an Objective?" No outcome/KPI measurement in this slice (deferred per
ADR-0014 / cascade-foundation NFR-200).

## 2. Actors & capabilities (`can()` map — ADR-0020)

Authorization is expressed in **capabilities** resolved by `shared.can(capability)` (ADR-0020 D4), not
role names. This slice is the first consumer, so it **introduces** the minimal `shared.can()` machinery
(see FR-330..333 + §6). The four ADR-0011 access roles become the **seeded** capability grants; the
admin-editable-roles UI (ADR-0020 D2) is a separate additive slice (Non-goal §5).

| Action | Capability key | Seeded grant (who, by default) | Scope |
|---|---|---|---|
| **READ** the cascade (objectives + work_lines + tasks) | *(none — no capability)* | every authenticated org member | `org_id` match (open: org-wide vs `own_bu` — §7-a) |
| **Manage** objectives (create / rename / archive) | `objective.manage` | `admin` | `org` (tightens OD-C-2's admin-only write, now via `can()`) |
| **Manage** work_lines (create / rename / archive) | `workline.manage` | `admin`, `ops_lead` | `org` (open: `own_bu` for ops_lead — §7-f) |

- **Every authenticated org member (incl. `member`)** — READs the cascade; may filter to "Mine"
  (tasks where they are R or A). No manage affordance.
- **`admin`** — READ + manage both catalogs (manage mode fully available).
- **`ops_lead`** — READ + manage work_lines (Projects & Processes); **not** objectives (OD-C-2 holds).
- **Derived `manager`** — READ like any member; no cascade-manage capability from the manager flag
  alone (mirrors OD-C-2's manager-gating deferral; true manager gating is an additive v2).
- **Deputy agent** — reads under the caller's JWT (ADR-0017 D2 / ADR-0020 D7); `can()` ceilings it
  automatically. No parallel agent rule.

`shared.can()` resolution = person → their roles → capabilities (+ scope), per ADR-0020 D3/D4. The
org chart becomes load-bearing for any `own_bu`-scoped grant (§7-f).

## 3. Functional requirements (EARS)

> ID range 3xx chosen to avoid collision with cascade-catalog (0xx/1xx) and cascade-foundation (2xx).

### Cascade view — everyone READ (the headline)
- **FR-300** — When any authenticated org member opens the **Work** destination, the system shall
  show a live link to the cascade view (label via the i18n catalog, FR-321), with **no role gate** on
  the link itself.
- **FR-301** — When the member opens the cascade view, the system shall render the ladder for the
  viewer's org: **Objectives → their linked work_lines (Project | Process) → the tasks linked to each
  work_line**, defaulting to non-archived objectives/work_lines and non-archived tasks.
- **FR-302** — When the member applies the **"Mine"** filter, the system shall surface only the
  objective→work_line branches that contain at least one task where the viewer is **R or A**, so the
  member sees their own line-of-sight (reuses the Tasks DB-view ownership semantics —
  `tasks-workspace` segment logic).
- **FR-303** — Where a work_line has **no objective link**, the system shall render it under an
  explicit "(Unlinked)" / no-objective branch so no work_line is silently hidden.
- **FR-304** — Where a task has **no work_line**, the system shall surface it under a trailing
  "No Project/Process" group (the shipped group-by-work_line "No work-line" group — reuse, do not
  rebuild).
- **FR-305** — The cascade view shall **reuse** the shipped cascade components — `GroupHeaderRow`
  (incl. the work-line type tag), `WorkloadCaption` (when filtered to a single person),
  `useCascadeCatalogs`, and the `db/objectives` + `db/work-lines` read functions — and shall **not**
  introduce a parallel cascade data layer or a second task editor.

### Manage mode — Work's manage-mode, reachable only from the cascade view

> **Amended 2026-07-07 by the nav-five-destinations slice** (`docs/specs/nav-five-destinations.spec.md`, FR-420..424)
> per the decisions.md **"Catalog placement"** refinement (2026-07-06): the catalog is **in Work as the manage-mode of the
> everyone-cascade**, not standalone nav. The manage routes are **relocated under `/work/`** (`/work/objectives`,
> `/work/projects-processes`); the retired top-level paths **redirect into the cascade**; each manage page shows the node's
> **up/down trace context**. This amendment supersedes the original FR-310–313 posture ("manage links out to flat
> standalone `/objectives` + `/projects-processes` routes"); the `can()` substrate, the cascade page, and pgTAP 72/73 are
> unchanged. Reversible UI routing — not a new ADR.

- **FR-310** *(amended)* — While the viewer holds `objective.manage` and/or `workline.manage`, the system shall
  surface a **Manage** affordance on the cascade view leading to the corresponding catalog management surface(s), now
  **relocated under `/work/`** (`/work/objectives`, `/work/projects-processes`) — nav-five-destinations FR-421/423.
- **FR-311** — While the viewer holds **neither** capability, the system shall **not** render the
  Manage affordance (no dead-end page — extends cascade-catalog FR-002/FR-011's direct-visit-denied
  posture to the affordance itself).
- **FR-312** *(amended)* — The management surface(s) shall be the **existing** Objectives + Projects & Processes
  catalog behaviors (create / rename / archive per cascade-catalog FR-003..015), now relocated under `/work/` as **Work's
  manage-mode** — reachable **only** from the cascade (no standalone nav group — nav-five-destinations FR-420); each
  manage page shows the node's **up/down trace context** (nav-five-destinations FR-422); **no new edit behavior** is
  introduced (cite FR-020/021/022).
- **FR-313** *(amended)* — A **direct visit** to the **retired** top-level paths (`/objectives`, `/projects-processes`)
  shall **redirect into the cascade** (`/work/cascade`, `replace`) — nav-five-destinations FR-421; a viewer lacking the
  capability visiting a manage route is **denied** (the `RequireCapability` guard redirects to `/work/cascade`), matching
  cascade-catalog FR-002/FR-011.

### Navigation — regroup only (do not redesign the shell)
- **FR-320** — The cascade view shall be registered as one **live link** under the **Work**
  destination in `mos-app/src/shell/destinations.tsx`, shown to every authenticated org member; no
  other destination, route, or shell chrome is added or reshaped (ADR-0019 D2/D8 — regroup only).

### i18n
- **FR-321** — Every user-facing string introduced by this slice (cascade link label, page title,
  group labels incl. "(Unlinked)" and "No Project/Process", the Manage affordance, empty states)
  shall resolve through the i18n catalog (`mos-app/src/i18n/messages.ts` + `useT()`), with `en` and
  `id` keys of identical shape (ADR-0019 D12 / ADR-0021).

### Authorization / RLS (the load-bearing change — see §6 for the full contract)
- **FR-330 (read authority)** — The system shall keep `mos.objectives` and `mos.work_lines` **SELECT
  org-scoped**: any authenticated org member may read all rows in their org. (This is the **already
  shipped** contract — `objectives_select_org` / `work_lines_select_org`; restated here as binding for
  the everyone view. The org-wide-vs-`own_bu` read-narrowing question is §7-a.)
- **FR-331 (write → `can()`)** — The system shall gate **INSERT / UPDATE** on `mos.objectives` via
  `shared.can('objective.manage')` and on `mos.work_lines` via `shared.can('workline.manage')`,
  **replacing** the current `shared.has_access_role('admin')` / `…('ops_lead')` predicates (ADR-0020
  D4 — opportunistic migration; Work spine is the first consumer). Seeded grants per §2.
- **FR-332 (`can()` introduction)** — This slice shall introduce `shared.can(capability)` (ADR-0020
  D4 — SECURITY-relevant function resolving person → roles → capabilities + scope), seeded so `admin`
  holds `objective.manage` + `workline.manage` and `ops_lead` holds `workline.manage`. The
  admin-editable-roles UI (ADR-0020 D2) is **out of scope** (Non-goal §5).
- **FR-333 (RLS is the authority)** — UI Manage-affordance visibility is convenience only; the RLS
  policies shall **independently** deny a non-capability-holder's write at the DB even if the UI were
  bypassed (extends cascade-catalog NFR-003).
- **FR-334 (no delete)** — No `DELETE` grant on either table; removal stays the soft `archived_at`
  toggle (extends cascade-catalog NFR-002 / cascade-foundation archival semantics).

## 4. Non-functional requirements

- **NFR-300 (phone-first — ADR-0019 D8).** The cascade view is specced phone-first: the ladder
  renders as grouped cards on phone (≤ the Tasks DB-view card grammar) and a dense grouped table on
  desktop, reachable from the bottom-tab Work destination. No desktop-only path to the core job.
- **NFR-301 (bilingual — ADR-0019 D12 / ADR-0021).** Every new string flows through the typed i18n
  catalog from day one (`messages.ts` + `useT()`); an `en`/`id` key-parity test is required. Existing
  reused strings (e.g. WorkloadCaption) are not retrofitted this slice but are flagged for the next
  i18n sweep.
- **NFR-302 (RLS is the authority).** Restates FR-333 at NFR weight: capability checks live in RLS,
  not only in the route guard or the UI. pgTAP proves both directions (§6).
- **NFR-303 (reuse, don't rebuild).** The read path reuses `useCascadeCatalogs`,
  `db/objectives.ts` (`listObjectives`), `db/work-lines.ts` (`listWorkLines`), `GroupHeaderRow`, and
  `WorkloadCaption`. No new cascade data layer, no second task table, no second task editor.
- **NFR-304 (tenancy).** Every read/write is org-scoped via `shared.current_org_id()`; the client
  never sends `org_id` (DB stamps it). A cross-org id is unreachable (extends cascade-foundation
  NFR-201 / OD-P1-1).
- **NFR-305 (no delete).** No `DELETE` grant anywhere; removal = `archived_at` (FR-334).
- **NFR-306 (operability / literacy bar — extends cascade-foundation NFR-206).** The cascade view is
  operable with no training by a high-school-graduate workforce: one screen answers one plain
  question ("where does my/our work ladder up?"); labels are CONTEXT.md everyday words (**Objective**,
  **Project/Process**, **Task** — never "initiative / SWP / lane taxonomy"); the primary actions are a
  single "Mine" toggle + a "Manage" affordance (capability-gated). A screen that needs explaining is a
  defect (deferred to the design-review 3-lens pass).
- **NFR-307 (a11y — WCAG-AA).** Group headers convey type/level by **text label, not color alone**
  (extends the shipped GroupHeaderRow work-line type tag — WCAG 1.4.1); full keyboard operability
  (reuse the Tasks keyboard grammar where shared); AA contrast; the ladder is navigable as regions.
- **NFR-308 (coverage).** ≥80% lines on changed code; tests assert behavior, not inflate numbers
  (CLAUDE.md gates). `npm run typecheck` + ESLint `--max-warnings=0` zero errors (both block merge).
- **NFR-309 (performance).** The cascade view resolves in ≤1 round-trip per org at Gordi scale (a few
  hundred objectives/work_lines + their tasks), reusing the mount-once `useCascadeCatalogs` contract
  (non-blocking; never gates the primary render). Filtering is client-side over already-fetched rows
  (mirrors the Tasks DB-view posture).

## 5. Non-goals (v1 fence — matches the intake OUT list)

- **Follow-up queues / B2B AR / retail pending bills** — ADR-0019 D5 / D14 step 4; gated on the ESB
  spike (`docs/reference/esb-settlement-api-spike.md`, LIKELY-NOT) **and** the D13 backup/restore
  drill gate. Not this slice.
- **Weekly-updates redesign** (exists, flag-gated) and the **Daily Log** — untouched.
- **Home, Plan/reference-data, Operate/activity roll-ins, the agent/deputy panel** — other
  destinations; not this slice.
- **Any change to the tasks table/editor internals or the app shell chrome** — the cascade view reuses
  the Tasks DB-view cascade components; the shell gets one added Work link only.
- **The full admin-editable-roles UI** (ADR-0020 D2 — create/rename roles, toggle capabilities per
  role, assign roles in `/admin/people`). This slice ships `can()` + seeded grants only; the UI is a
  separate additive slice.
- **Comments / @mentions on objectives & work_lines** (ADR-0019 D4 per-entity comms pattern) —
  additive per-entity later; not this slice.
- **Strategy / Outcome / Output cascade layers** (ADR-0014 deferred layers) — vocabulary only.
- **The standalone Workload page, per-layer Accountable/Responsible, and `lane` in the UI** —
  deferred v2 per cascade-foundation (NFR-200, FR-230..234 are the eventual end-state). The shipped
  per-person Workload *caption* is reused as-is.
- **Intra-BU activity-level read/write scoping** — deliberately absent until a real conflict shows
  (ADR-0019 deferral / ADR-0020).
- **Outcome/KPI measurement** on the cascade — structural line-of-sight only in v1.

## 6. RLS contract (read + write) — the load-bearing change

**Current state (verified against shipped migrations):**

| Table | SELECT (today) | INSERT/UPDATE (today) | Source |
|---|---|---|---|
| `mos.objectives` | **org-readable** — any authenticated org member (`objectives_select_org`) | **admin only** (`has_access_role('admin')`, OD-C-2) | `20260624000001` + `20260626000003` |
| `mos.work_lines` | **org-readable** — any authenticated org member (`work_lines_select_org`) | **admin \| ops_lead** (`has_access_role`) | `20260624000001` |

> READ is **already** everyone-org-readable (the brief's "admin-only read" premise is incorrect —
> pgTAP AC-212 already proves a `member` session reads its org's rows). The new work is the everyone
> **VIEW** + migrating **WRITE** to `can()`.

**Target contract (this slice):**

| Table | SELECT (v1) | INSERT / UPDATE (v1) | DELETE |
|---|---|---|---|
| `mos.objectives` | org-scoped, unchanged (`org_id = shared.current_org_id()`) | `org_id = current_org_id() AND shared.can('objective.manage')` | **denied** (no grant) |
| `mos.work_lines` | org-scoped, unchanged | `org_id = current_org_id() AND shared.can('workline.manage')` (scope `org` by default; `own_bu` open — §7-f) | **denied** (no grant) |

- **`shared.can(capability)`** lands with this slice (FR-332; ADR-0020 D4). Seeded grants: `admin` →
  `{objective.manage, workline.manage}`; `ops_lead` → `{workline.manage}`; `member`/`finance` → none
  for manage. The four ADR-0011 roles are seeded rows (renameable, not deletable); the admin-editable
  UI is Non-goal §5.
- The policy rewrite is **reversible** (drop the two `can()` policies, restore the `has_access_role`
  predicates — the existing DOWN sections of both migrations already carry the restore SQL).

**pgTAP obligations (each AC in §8 tagged with its owning layer):**

- **READ — member CAN read (restates + extends cascade-foundation AC-212 for this slice's contract):**
  an org-A `member` session SELECTs both tables and sees all org-A rows (active **and** archived — the
  manage surface lists archived); org-B rows are invisible. (AC-310)
- **WRITE — non-privileged member CANNOT write:** an org-A `member` session INSERT/UPDATE on
  `mos.objectives` is **denied** (AC-311); on `mos.work_lines` is **denied** (AC-312). This is the
  "non-privileged member cannot write" obligation from the intake, now resolved through `can()`.
- **WRITE — capability holders CAN write:** `admin` writes both (AC-311, AC-312); `ops_lead` writes
  `work_lines` but is **denied** on `objectives` (OD-C-2 holds — AC-311).
- **RLS is the authority (FR-333):** a session with no manage capability is denied at the DB even
  with the UI bypassed (AC-313).
- **No delete (FR-334):** any session `DELETE` on either table is denied (AC-314; extends
  cascade-catalog AC-012).
- **Tenancy:** org-A session cannot reach org-B rows by read or write (AC-315; extends
  cascade-foundation NFR-201 / cascade-catalog AC-013).

## 7. Open decisions for owner sign-off

- **(a) READ visibility — org-wide vs BU-scoped.** Recommend **org-wide** (the shipped contract +
  ADR-0019 D2's "cascade view for everyone" + tasks are already org-readable per OD-P1-3 —
  cross-unit visibility is the product). ADR-0020's `own_bu` scope *could* narrow objectives/work_lines
  read to the viewer's BU; adopt that **only on evidence of a real conflict** (mirrors ADR-0020's
  intra-BU deferral). *Confirm org-wide read for v1.*
- **(b) Route — new `/work/cascade` vs elevating `/objectives`.** Recommend a **new `/work/cascade`
  route** as the everyone surface, with the existing `/objectives` (+ Projects & Processes) routes
  retained as the **manage mode** destination(s) the affordance links to. Elevating `/objectives`
  would collide with its admin-only direct-visit contract (FR-002) and bury the everyone view under an
  admin path. *Confirm.*
- **(c) Manage mode — separate route vs inline affordance.** Recommend an **inline "Manage"
  affordance on the cascade view** that routes to the existing catalog pages (capability-gated), **not
  a second inline editor** — avoids the "two homes per entity" trap (Lens-C) and reuses AC-020's
  already-curated create/rename/archive happy path. *Confirm.*
- **(d) [deviation flag — resolve first] RLS-premise reconciliation.** The intake asserts
  objectives/work_lines are "admin-only for read today." Verified false: SELECT is already
  org-readable (`20260624000001`, pgTAP AC-212). This slice therefore builds the everyone **view** over
  already-readable data and migrates **write** to `can()` (§6). *Owner/Director: acknowledge this
  reframe so the implementer doesn't "fix" a policy that is already correct.*
- **(e) `shared.can()` landing.** Confirm the **minimal** `can()` (function + `objective.manage` +
  `workline.manage` + seeded role grants) lands **with this slice** (ADR-0020 names Work spine as the
  first consumer), with the admin-editable-roles UI deferred (Non-goal §5). Alternative: split `can()`
  into a dedicated prerequisite ADR/slice and keep `has_access_role` here — *not recommended* (it
  re-litigates ADR-0020's opportunistic-where-touched posture and delays the named first consumer).
- **(f) `workline.manage` scope for `ops_lead` — `org` vs `own_bu`.** Recommend **`org`** for v1
  (matches today's admin|ops_lead predicate; simplest). ADR-0020's `own_bu` is available if cross-BU
  write conflicts (e.g. Marketing editing Finance's work_line) emerge — adopt on evidence. *Confirm
  org scope for v1; note the own_bu upgrade path.*

## 8. Acceptance criteria (Given / When / Then — each tagged with its owning test layer)

> Test pyramid: each AC owned by **ONE** test at the lowest sufficient layer. AC-ids are tagged in the
> owning test title so `grep -r AC-3XX` finds the proof. Existing coverage not re-curated:
> cascade-catalog AC-020 (create/rename/archive e2e) and cascade-foundation AC-212/213 (read-isolation
> + member-write-denied) already cover the pre-existing contract; ACs below extend or restated-bind
> them for this slice where the behavior changes.

### Cascade view — unit (Vitest/RTL, mocked)
- **AC-300** *(FR-300/301/305, unit)* — *Given* an authenticated member and mocked cascade data
  (one objective → two work_lines → tasks), *When* the cascade view renders, *Then* it shows the
  ladder as Objective group → work_line group headers (reusing `GroupHeaderRow`, incl. the Project /
  Daily-ongoing type tag) → task rows; and it reuses `useCascadeCatalogs` (no parallel loader).
- **AC-301** *(FR-302/303/304, unit)* — *Given* the "Mine" filter on and the viewer is R on one task
  under an objective-linked work_line and R on one task with **no** work_line, *When* it renders,
  *Then* only the branch containing the viewer's task shows (line-of-sight), the unlinked-work_line
  case renders under "(Unlinked)", and the no-work_line task renders under "No Project/Process" — no
  task is silently hidden.
- **AC-302** *(FR-310/311/313, unit)* — *Given* a viewer **without** `objective.manage` or
  `workline.manage`, *When* the cascade view renders, *Then* no "Manage" affordance appears; *and
  given* a viewer **with** `workline.manage` only, *Then* the affordance leads to the Projects &
  Processes surface **relocated under `/work/`** (`/work/projects-processes`, not Objectives); *and
  given* an `admin`, *Then* the objectives affordance links to `/work/objectives`. *(Amended 2026-07-07:
  the relocated `/work/*` hrefs + the redirect/deny of retired top-level paths are proven by
  nav-five-destinations AC-405/407; the up/down trace is proven by AC-406.)*
- **AC-303** *(FR-305, unit)* — *Given* the cascade filtered to a single person, *When* it renders,
  *Then* the `WorkloadCaption` ("Name's work: N projects and M daily jobs.") appears (reuse, not a
  rebuilt caption).
- **AC-304** *(FR-300/320, unit)* — *Given* any authenticated member, *When* the Work destination
  renders (rail + bottom-tab), *Then* the cascade link appears with **no** role gate; *and* the label
  resolves via the i18n catalog (`useT()`), yielding the `id` string when locale is `id`.

### RLS contract — integration (pgTAP, `supabase test db`)
- **AC-310** *(FR-330, pgTAP — READ, member CAN read)* — *Given* an org-A `member` session, *When* it
  SELECTs `mos.objectives` and `mos.work_lines`, *Then* it sees all org-A rows (active **and**
  archived) and **zero** org-B rows. *(Restates cascade-foundation AC-212 for the everyone-view
  contract, adding the archived-row visibility the manage surface relies on.)*
- **AC-311** *(FR-331/333, pgTAP — WRITE objectives)* — *Given* an org-A `member` session, *When* it
  INSERTs/UPDATEs `mos.objectives`, *Then* it is **denied** (`can('objective.manage')` false); *given*
  an `ops_lead` session, *Then* it is **denied** (OD-C-2 holds); *given* an `admin` session, *Then* it
  **succeeds**.
- **AC-312** *(FR-331/333, pgTAP — WRITE work_lines)* — *Given* an org-A `member` session, *When* it
  INSERTs/UPDATEs `mos.work_lines`, *Then* it is **denied** (`can('workline.manage')` false); *given*
  an `ops_lead` or `admin` session, *Then* it **succeeds**.
- **AC-313** *(FR-333/NFR-302, pgTAP — RLS is the authority)* — *Given* a session whose roles carry
  **no** manage capability, *When* it writes via a bypassed-UI path (direct SQL), *Then* the write is
  **denied** at the DB (the UI gate is not the source of truth).
- **AC-314** *(FR-334/NFR-305, pgTAP — no delete)* — *Given* any session, *When* it attempts DELETE
  on either table, *Then* it is **denied** (no grant). *(Extends cascade-catalog AC-012 to the
  post-`can()` policies.)*
- **AC-315** *(NFR-304, pgTAP — tenancy)* — *Given* an org-A session, *When* it reads or writes,
  *Then* org-B rows are unreachable by SELECT or by INSERT (org_id stamped server-side); a client-supplied
  `org_id` is ignored.

### Cross-stack — end-to-end (Playwright, 1 curated journey)
- **AC-305** *(FR-300..305/310/321, e2e — the everyone-cascade journey)* — *Given* an authenticated
  `member` signed in, *When* they tap **Work → Cascade**, *Then* they see the org's
  objective→work_line→task ladder; *When* they toggle **Mine**, *Then* only their line-of-sight
  remains (their R/A tasks up through their work_lines to their objectives), the "(Unlinked)" and "No
  Project/Process" branches render rather than hiding tasks, and the chrome is phone-first bottom-tab.
  *(The manage-mode happy path is already curated by cascade-catalog AC-020 and is not re-run here.)*

### FR → AC coverage (every FR has ≥1 AC)
FR-300→AC-300/304 · FR-301→AC-300/305 · FR-302→AC-301/305 · FR-303→AC-301 · FR-304→AC-301 ·
FR-305→AC-300/303 · FR-310→AC-302/407 · FR-311→AC-302 · FR-312→AC-302/406 + existing AC-020 (the manage
surface IS the existing catalog behavior — create/rename/archive path already curated by AC-020; this
slice only re-keys its gate to `can()` and relocates it under `/work/` with trace — nav-five-destinations
FR-420/421/422) · FR-313→AC-302/405 (direct-visit redirects into the cascade) · FR-320→AC-304 ·
FR-321→AC-304 · FR-330→AC-310 · FR-331→AC-311/312 · FR-332→AC-311/312 (can() proven by the write
decisions) · FR-333→AC-313 · FR-334→AC-314.

---

SPEC-DONE
