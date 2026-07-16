# ADR-0050 — Signal data model, 5-grant visibility, Team substrate, fan-out, revisions/retraction

- **Status:** Proposed (buildout Step 4). Items tagged **RATIFY** below are **provisional / fail-closed**
  and must be confirmed at the Step-4 owner walkthrough before merge (per `docs/plans/CLOUD-AGENT-HANDOFF.md`
  conservative-default policy). A "no" narrows the affected clause; it never reopens domain law.
- **Date:** 2026-07-16
- **Deciders:** eng-planner (author); grill + owner walkthrough (ratifier).
- **Context sources:** `docs/specs/signals-v1.spec.md` (the contract), `CONTEXT.md` (Signal glossary),
  `docs/decisions.md` OD-REDESIGN-33..51/59, `docs/adr/0025-…redesign-direction.md` D20–D37,
  `docs/experience-contract.md` Rules 1–12, `docs/adr/0005-weekly-updates-upward-only-rls.md`,
  `docs/adr/0011-auth-model-rbac-access-roles.md`, `docs/adr/0020-capability-authorization.md`.

## Context

A **Signal** is a real-time, attributable, factual note that *something happened or was observed*
(OD-33/D20). It has **no PIC, Supervisor, due date, or work Status**. It supersedes the retired mandatory
Weekly Update and operations-only Daily Log. Step 4 must persist Signals, gate their visibility, and render
a capture-minimal composer + ambient feed + archive + record page — reusing existing MOS grammar (Rule 11).

Two forces shape the model:
1. **Anti-over-share (NFR-402).** Unlike `mos.tasks` (org-readable — "cross-unit visibility is the product"),
   a Signal's default reach is **narrow and upward** (OD-36/50). Sibling Teams do not see each other. This is
   the opposite default from tasks, so the model cannot reuse the org-readable task RLS; it needs default-deny.
2. **Team is below BU (OD-50/53).** A Signal belongs to one **Team** and derives BU/Site. Today
   `shared.business_units` holds only the BU layer; there is **no Team table**. Anchoring a Signal to a BU
   would re-bake the exact "BU=Team" conflation OD-50 corrected.

## Decision

### D1 — Team substrate built now, seeded not admin-CRUD (RATIFY-1)
Introduce three `shared` tables — `shared.sites`, `shared.teams`, `shared.team_memberships` — as the minimal
concrete operating-group layer under BU. Populated by **seed migration** (mirroring the E7 `e7-data.js`
model), exactly as `shared.business_units` were. **Admin CRUD is out of scope (OD-52).** `shared.teams` carries
`business_unit_id` (parent BU, not null) and nullable `site_id` (central/cross-site Teams have none). A
Signal's `owning_team_id` derives BU (`teams.business_unit_id`) and Site (`teams.site_id`) via join; **BU/Site
are never stored on the Signal row** (FR-403; CONTEXT "no duplicated BU/Site fields").
- *Rejected Alt A:* anchor Signal to `business_units` for v1 — re-bakes the BU=Team conflation, painful re-point.
- *Rejected Alt B:* full admin-configurable Teams/Sites/layers now — that is OD-52's Admin step; balloons Step 4.

### D2 — Visibility rank lives on the BU, default fail-closed (RATIFY-2/4)
Add nullable `signal_visibility_rank int` to `shared.business_units` (NULL ⇒ **0**, lowest = "Operations").
Higher rank = broader upward default reach (OD-36). **Every BU ships rank NULL/0 ⇒ NO cross-BU reach until an
admin sets ranks (fail-closed).** A viewer's effective rank = `max(signal_visibility_rank)` over the BUs of
the roles the viewer holds (union — matches dual-hat); grant iff strictly `> owning-BU rank`.
- *Rejected Alt:* rank on the Team (as the mockup did) — a mockup simplification vs OD-36/50 "higher **BU** layer".

### D3 — `mos.signals` core + five child tables
`mos.signals` (factual record) + `mos.signal_mentions` (access grant + fan-out audit) +
`mos.signal_acknowledgements` ("seen", D33) + `mos.signal_revisions` (immutable correction audit, D31) +
`mos.signal_tasks` (Signal↔Task many-to-many bridge, D25/OD-39). `mos.comments` is **reused** for the Signal
comment thread by adding `'signal'` to its `entity_type` CHECK (no new comment table). `author_id`,
`owning_team_id`, `source` are **immutable after post** (D31). `source = 'human'` only in v1; `source`/`source_ref`
columns exist but stay unused (FR-419). No `DELETE` grant on any table (soft-retract only — matches `mos.tasks`).

### D4 — Read authorization: `mos.can_read_signal(sig)` = default-deny + 5 positive grants (FR-405)
A `SECURITY INVOKER STABLE search_path=''` predicate (mirroring `mos.can_edit_task`) reused by the `signals`
SELECT policy and every child-table read. Returns true iff `sig.org_id = current_org_id()` **AND** any of:

| # | Grant | Predicate |
|---|---|---|
| R1 | Owning-Team member | active `team_memberships` row for `sig.owning_team_id` |
| R2 | BU-scoped Role over parent BU (RATIFY-3) | viewer holds any role whose `business_unit_id` = owning Team's BU |
| R3 | Higher BU visibility layer (RATIFY-2/4) | viewer's max role-BU rank **>** owning-BU rank (default 0 ⇒ inert) |
| R4 | Explicit unrevoked mention | `signal_mentions` targets this person, an active Team of theirs, or a BU of a held role |
| R5 | Authorized override (RATIFY-8) | `can('signal.read_all')` — **not registered in v1 ⇒ inert** |

No match ⇒ **deny**. Retracted Signals are **not** hidden by RLS (author + grantees keep audit read); they are
excluded from *default feed/archive/analytics* at the **query layer** (`where retracted_at is null`) and render
as a tombstone (D31, RATIFY-10). **R2 breadth (RATIFY-3):** the current `roles` schema cannot distinguish
BU-wide from Team-scoped roles, so R2 grants read to *any* role in the owning BU — slightly broader within one
BU, but never crosses BUs; narrow later with a role `team_scope` column when Admin/org-structure lands.

### D5 — Correction + retraction via a guard trigger (RATIFY-9)
A `BEFORE UPDATE` trigger `mos._signal_guard_update` (a) rejects any change to the immutable columns
(`author_id`/`owning_team_id`/`source`/`org_id`/`created_at`), (b) on each changed correctable field
(`body`/`occurred_at`/`category`/`attention`) appends a `signal_revisions` row and sets `edited_at`,
(c) gates `retracted_at` to the author or a `signal.retract` holder and requires a non-empty `retract_reason`.
The trigger is `SECURITY DEFINER` (with `revoke execute … from public,anon,authenticated` — trigger execution
does not check EXECUTE, so the revoke keeps the definer-revoke lint clean) **solely** so it can append to
`signal_revisions`, which has **no INSERT grant to `authenticated`** (append-only, trigger-written only). It
re-derives org/actor from `OLD` + `current_person_id()`, trusting nothing from the client. Chosen over a
`correct_signal` RPC so corrections stay enforced even on a direct PostgREST PATCH.

### D6 — Fan-out: one synchronous SECURITY DEFINER RPC, dedup + cap (RATIFY-6)
A mention is **both** a row-level read grant (R4) **and** an intentional Inbox nudge (D24/OD-38); visibility
*without* a mention never notifies (FR-406). `mos.fan_out_signal_mention(p_signal_id)` (`SECURITY DEFINER`):
asserts the caller is the Signal's author; resolves recipients **deduplicated** (`@Person`=1; `@Team`=active
members; `@BU`=active members of child Teams + BU-scoped-Role holders); enforces a **cap N=50** (above the cap
the RPC rejects so the client must confirm — RATIFY-6, N picked at walkthrough); delivers via the existing
`mos.create_notification` seam (org-walled). Recipients are **snapshotted at post** — future Team members gain
read (R1/R4) but get **no retroactive notify** (D24). The `@BU` path re-checks `signal.mention_bu` (fail-closed).
Cross-owner delivery never happens via a direct INSERT (NFR-403) — only through this DEFINER seam.

### D7 — Capabilities registered fail-closed (RATIFY-5)
Register in `shared.role_capabilities`: `signal.create` (default-grant to `member`), and
`signal.create_for_team` / `signal.mention_bu` / `signal.retract` (**default-deny**, granted to
manager/finance/admin bundles per `e7-data.js`). `signal.correct` is author-implicit (no capability).
`signal.read_all` (R5) is **not registered** in v1 (RATIFY-8). INSERT of a Signal requires `signal.create`;
`owning_team_id` must be one of the author's active-membership Teams unless `signal.create_for_team` (helper
`mos.can_post_signal_for_team`); a `mention_kind='bu'` row requires `signal.mention_bu`.

## Consequences

- **Positive.** Default-deny + upward grants encode OD-36/50 exactly; the org wall holds structurally
  (`org_id` defaulted + WITH-CHECK-pinned everywhere; `can_read_signal` gates org first; a cross-org
  `person_id` claim matches no in-org membership/role rows). The Team layer is real without an Admin build.
  Corrections/retractions are trigger-enforced even against raw PostgREST. Fan-out reuses the audited
  notification seam. Comments/record-panel/pickers are reused, satisfying Rule 11.
- **Negative / debt.** R2 over-grants slightly within one BU until a role `team_scope` column exists (RATIFY-3).
  R3/R5 are inert until admin config/registration — intentional fail-closed, but means cross-BU upward reach
  does not work on day one (acceptable: Step 4 ships the *mechanism*, Admin config lands later). Fan-out is
  synchronous (cap 50) — an async queue is deferred until volume justifies (RATIFY-6 sequel). Seeded Teams/Sites
  drift from reality until Admin CRUD (OD-52) lands.
- **Reversibility.** Every migration ships a manual DOWN at file foot; pre-prod is `supabase db reset`; staging
  reset + deploy stay owner-gated (OD-34, NFR-404). No hard delete anywhere.
- **Follow-ups (not Step 4):** Admin CRUD for Teams/Sites/ranks/grants (OD-52); narrow R2 with `team_scope`;
  async fan-out queue; deputy dictation + category/attention suggestion; auto-emitted Signals (`source` ≠ human).
