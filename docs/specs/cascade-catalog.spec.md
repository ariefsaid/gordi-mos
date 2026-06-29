# Spec — Cascade catalog management (Objectives + Projects/Processes)

- Status: Built & verified (2026-06-26) — owner-approved via the OD-C-2 grill; all FR/NFR/AC implemented
  (unit + pgTAP + AC-020 e2e green); 4-lens review battery recorded in `docs/reviews/feat-cascade-catalog.md`
- Source decisions: **OD-C-2** (`docs/decisions.md`), grill-with-docs 2026-06-26
- Vocabulary: `CONTEXT.md` § Cascade · § Access-role · § Surfaces
- Related: ADR-0011 (access roles), ADR-0014 (cascade foundation), ADR-0015 (naming lock), ADR-0013 (records-workspace UI)
- Extends what shipped in `docs/plans/2026-06-24-cascade-first-slice.md` (the two lookups + task pickers)

## 1. Overview & user value

The cascade lookups (`mos.objectives`, `mos.work_lines`) ship today, and the task form reads them — but
**no one can create or edit them from the app**; rows exist only via SQL seed. This slice adds the
two **management surfaces** so the catalogs are self-service for the people allowed to own them.

Two nav items under **Workspace** (OD-C-2): **Objectives** and **Projects & Processes**. Each is a simple
list with add / rename / archive, role-gated so a user who cannot write the catalog never sees its page.

**Canonical UI term = Project/Process** (ADR-0015). This slice also re-labels the shipped task-form field
from the mislabeled "Work-line" to **"Project/Process"** (physical table stays `mos.work_lines`).

**Out of scope:** derived-manager RLS gating (deferred, OD-C-2 — `shared.is_manager()` is a v2 add);
hard delete (NFR-002); lane / Accountable·Responsible on these entities (ADR-0014 v2); Strategy/Outcome/
Output surfaces; any change to the task pickers' behavior beyond the field re-label.

## 2. Actors & permissions (OD-C-2; admin = superset)

| Surface | May read (picker + list) | May add / rename / archive |
|---|---|---|
| Objectives | any org member (existing SELECT RLS) | **admin only** |
| Projects & Processes | any org member | **ops_lead + admin** |

- "admin" / "ops_lead" are assigned access roles (`shared.has_access_role`), already in the JWT claim.
- **manager** is NOT used in this slice (OD-C-2 deferral). Nav visibility matches write permission exactly.
- No role may **delete** either catalog (NFR-002) — removal is the soft `archived_at` toggle.

## 3. Functional requirements (EARS)

### Objectives
- **FR-001** — While the viewer holds the `admin` access role, the system shall display an **Objectives**
  nav item under Workspace linking to the Objectives management page.
- **FR-002** — While the viewer does NOT hold `admin`, the system shall NOT render the Objectives nav item,
  and the system shall redirect a direct visit to the Objectives route to `/` (no dead-end page).
- **FR-003** — When an admin opens the Objectives page, the system shall list every objective in the org
  (active and archived), ordered active-first then by name, each showing its name and archived state.
- **FR-004** — When an admin submits a non-empty new objective name, the system shall create the objective
  in the viewer's org and show it in the list without a full reload.
- **FR-005** — When an admin renames an objective to a non-empty name, the system shall persist the new
  name; the change shall be reflected anywhere the objective is referenced (it is a lookup).
- **FR-006** — When an admin archives an active objective, the system shall set `archived_at`; the objective
  shall no longer appear in the task-form Objective picker but shall remain on tasks already linked to it.
- **FR-007** — When an admin unarchives an archived objective, the system shall clear `archived_at` and the
  objective shall reappear in the task-form picker.

### Projects & Processes
- **FR-010** — While the viewer holds `ops_lead` or `admin`, the system shall display a **Projects &
  Processes** nav item under Workspace linking to its management page.
- **FR-011** — While the viewer holds neither `ops_lead` nor `admin`, the system shall NOT render the
  Projects & Processes nav item, and shall redirect a direct visit to its route to `/`.
- **FR-012** — When a permitted user opens the page, the system shall list every work-line in the org
  (active and archived), each showing name, **type** (Project | Process), and archived state.
- **FR-013** — When a permitted user submits a non-empty name and a type ∈ {project, process}, the system
  shall create the work-line in the viewer's org and show it without a full reload.
- **FR-014** — When a permitted user renames a work-line to a non-empty name, the system shall persist it.
  (The **type** is immutable after creation — changing project↔process would silently re-classify linked
  tasks' load; to re-classify, archive and re-create.)
- **FR-015** — When a permitted user archives / unarchives a work-line, the system shall toggle
  `archived_at` with the same picker-visibility + FR-retention semantics as FR-006/FR-007.

### Shared / task form
- **FR-020** — Where the task create/detail form previously labeled the work-line field "Work-line", the
  system shall label it **"Project/Process"** (no behavioral change to the picker).
- **FR-021** — The system shall reject (DB + UI) a blank or whitespace-only name on create or rename for
  both catalogs.
- **FR-022** — On a failed write (permission or network), the system shall surface the failure and leave
  the list in its prior state (optimistic update rolled back).

## 4. Non-functional requirements

- **NFR-001 (tenancy)** — Every read and write shall be org-scoped via `shared.current_org_id()`; the client
  shall never send `org_id` (DB stamps it). A cross-org id shall be unreachable.
- **NFR-002 (no delete)** — No `DELETE` grant on either table; removal is `archived_at` only (extends the
  shipped lookup posture).
- **NFR-003 (RLS is the authority)** — UI gating is convenience only; the RLS policies shall independently
  enforce §2 such that a non-permitted user's write fails at the DB even if the UI were bypassed.
- **NFR-004 (coverage)** — ≥80% lines on changed code; tests assert behavior (per CLAUDE.md gates).
- **NFR-005 (a11y)** — Forms keyboard-operable, inputs labeled, errors announced (WCAG-AA, design-plan).

## 5. Acceptance criteria (Given/When/Then)

Layer per the test pyramid is noted; each AC is owned by ONE test at the lowest sufficient layer.

- **AC-001** (unit) — *Given* a viewer without `admin`, *When* the rail renders, *Then* no "Objectives"
  nav item appears.
- **AC-002** (unit) — *Given* a viewer with `admin`, *When* the rail renders, *Then* an "Objectives" nav
  item appears; *and* given `ops_lead` (not admin), *Then* it does not.
- **AC-003** (unit) — *Given* a viewer with `ops_lead`, *When* the rail renders, *Then* a "Projects &
  Processes" nav item appears; *and* given a member with neither role, *Then* it does not.
- **AC-004** (unit) — *Given* the Objectives page with active + archived rows, *When* it renders, *Then*
  active rows show first, archived rows show an archived affordance + an Unarchive control.
- **AC-005** (unit) — *Given* the add field is empty/whitespace, *When* the user submits, *Then* a "name is
  required" error shows and no create is attempted.
- **AC-006** (unit) — *Given* a permitted user edits a name and saves, *When* the save succeeds, *Then* the
  row shows the new name; *When* the save fails, *Then* the row reverts and an error is surfaced.
- **AC-007** (unit) — *Given* the work-line add form, *When* it renders, *Then* a type selector offers
  exactly Project and Process and create is blocked until a type is chosen.
- **AC-010** (pgTAP) — *Given* an `admin` session, *When* it inserts/updates/archives an objective in its
  org, *Then* it succeeds; *Given* an `ops_lead`-only session, *Then* the same objective write is denied.
- **AC-011** (pgTAP) — *Given* an `ops_lead` (or `admin`) session, *When* it inserts/updates/archives a
  work-line, *Then* it succeeds; *Given* a `member`-only session, *Then* the write is denied.
- **AC-012** (pgTAP) — *Given* any session, *When* it attempts `DELETE` on either table, *Then* it is denied
  (no grant).
- **AC-013** (pgTAP) — *Given* a session in org A, *When* it lists either catalog, *Then* org B rows are not
  returned; *When* it inserts, *Then* the row is stamped org A regardless of any client `org_id`.
- **AC-014** (pgTAP) — *Given* an archived objective/work-line, *When* the task-form picker query runs,
  *Then* it is excluded; *When* a task already links it, *Then* the task's join still resolves the name.
- **AC-020** (e2e, 1 curated journey) — *Given* an admin on Objectives, *When* they add "Q4 Push", rename it
  to "Q4 Growth Push", then archive it, *Then* each step is reflected in the list and the archived item
  leaves the task-form Objective picker. (Covers the create→rename→archive happy path end-to-end.)

## 6. Open questions

None — all forks resolved in the 2026-06-26 grill (OD-C-2).
