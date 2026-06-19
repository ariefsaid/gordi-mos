# ADR-0013 — Records-workspace UI architecture (shell, hybrid record surface, ⌘K + search seam)

- **Status:** Accepted (2026-06-19)
- **Deciders:** Owner (Arief), Director
- **Supersedes (in part):** the UI-revamp design-plan §1.3 / §2.3 "retire the top bar" exploration
- **Refines:** ADR-0007 (tasks split-view master-detail), ADR-0009 (design-kit tokens + dark theme)
- **Authorities:** `docs/decisions.md` OD-P4-9 / OD-P4-10 / OD-P4-11; the signed-off mockups in
  `docs/design-mockups/ui-revamp/*.html` (each ends with a binding DESIGN-PLAN ANCHOR); `DESIGN.md`;
  `docs/jtbd.md`.

This ADR records only the load-bearing, hard-to-reverse decisions of the records-workspace revamp.
Surface-by-surface build detail (exact files, code, tests) is in
`docs/plans/2026-06-19-ui-revamp-build.md`. Per-component token/state choices live in the design-plan.

---

## Context

The MOS surfaces do not yet read as the records-workspace the design kit describes. The shell, the
Tasks table, the task detail drawer, My Week, and the (non-existent) ⌘K palette were explored across
four signed-off mockups. The owner converged the direction and ratified three decisions
(OD-P4-9/10/11) that **reverse** part of the earlier exploration. This ADR locks the architecture the
build plan implements against, so future maintainers see *why* the shell looks the way it does without
re-reading the whole design-plan exploration trail.

The revamp is **presentation + exactly one new read path**. It does not change the data model, RLS,
auth, or the schema seams. The one backend dependency — a task search read path for ⌘K — is called out
explicitly below.

---

## Decision 1 — Shell: a global brand-left top bar over a navigation-only rail

The app shell is a two-column grid `[ rail (var(--rail-w)) | main ]`. A **persistent global top bar**
spans the main column (and visually sits over the rail via a fixed-width brand column). This **reverses**
the design-plan §1.3 exploration (Alt 1B "remove the global Header; breadcrumb at content-top"), per
**OD-P4-9** (top bar kept) and **OD-P4-11** (brand-left layout).

**Top-bar layout contract (left → right):**

1. **Brand lockup** — Gordi logo mark + "Gordi MOS" wordmark, in a **fixed 236px column** that sits
   *over* the rail with a right divider. This column owns workspace identity.
2. **Breadcrumb** — in a flexible `min-width:0` track so a long crumb shrinks/ellipsizes and can never
   shove the brand column or the right cluster. The breadcrumb **dedups the brand**: the leading
   "Gordi MOS" crumb is dropped (`Tasks`, or `Tasks › <record>`).
3. Spacer.
4. **Right cluster** (`flex:none`): **⌘K search trigger** · **notification bell** (icon-only,
   non-functional IA stub) · **user chip** (avatar + name + role, with the sign-out menu).

**Rail contract:** **navigation only** — the "Workspace" nav group (accent-icon active selection) +
the Settings stub at the foot. The rail **loses** its workspace switcher, its in-rail search row, and
its foot user chip (all three move to the top bar). This is the inverse of PR #29, which had moved
⌘K + the user chip *into* the rail.

**Why it is load-bearing:** breadcrumb wayfinding and viewer identity now live in the top bar, not the
rail or content-top — every surface composes under a stable chrome. Reversing it later (back to
content-top) would touch every surface again, so the contract is fixed here. The 236px brand column
width is a hard constraint (it matches the rail width and is the anti-bleed anchor for the breadcrumb).

**Consequences:**
- The existing `Header.tsx` (near-empty breadcrumb strip) is replaced by a populated `TopBar`. The
  `--header-h` token is retained (the top bar uses it).
- `Breadcrumb.tsx` drops the leading "Gordi MOS" crumb.
- `RailNav.tsx` is decomposed: the workspace switcher, in-rail search, and foot user chip are removed;
  the nav group + Settings stub remain.
- The mobile (<920px) hamburger relocates into the top bar's leading slot; the rail collapses to the
  existing `MobileDrawer`.

## Decision 2 — Dark-mode token rule: themed scopes set text color explicitly; label/meta → `--tertiary`

This is the architectural lesson worth locking (not a per-component note), per **OD-P4-11.2**:

- **A themed scope MUST set its own text `color`.** Relying on inheriting `body`'s computed color is a
  bug: a body-level `var(--ds-font-color-primary)` resolves the *light-theme* value and bakes near-black
  into the inherited computed color, so `.dark` children render near-black on a dark surface (invisible).
  The verified offender was the ⌘K palette. Every surface root in this revamp sets `color` explicitly.
- **Label / meta roles map to `--ds-font-color-tertiary` (≈4.6:1 on dark), never `--ds-font-color-light`
  (≈3.1:1, fails WCAG-AA).** Affected roles: table column overline, rail group label, nav counts, ⌘K
  group labels, kbd hints. The OD-P4-10 overline intent (lighter than body + weight 400) is preserved —
  `tertiary` is still quieter than body.
- Status / accent text keeps the `--ds-tag-text-*` pairings (already AA in both themes). Status is
  always **dot + text**, never color-alone.

Runtime mapping: `--ds-font-color-tertiary` and `--ds-font-color-light` both crosswalk to
`--muted-foreground` in the shadcn runtime (design-plan §8); at runtime the rule is "label/meta roles use
`text-muted-foreground` and the scope sets its color — never inherit."

**Consequences:** the design-reviewer's three regression-invariants (RI-1: no `.dark` text inherits the
light primary; RI-2: label roles use tertiary; RI-3: identity strings ellipsize + nowrap) are folded
into the build plan's dark-mode AA pass as per-surface checks.

## Decision 3 — Hybrid record surface: one canonical `/tasks/:id`, three widths

The task detail surface stays **one component, three widths** (ADR-0007's "one UI, two widths" extended),
per design-plan §3.3 Alt 3C (hybrid), resolved as Q1 in OD-P4 (2026-06-19):

- **`/tasks/:id`** (and `/tasks/new`) is the single canonical record surface, reached identically from
  the list row, the ⌘K palette, and My Week.
- At **≥1100px** it is the non-modal drawer beside the persistent table (triage preserved: Tab flows
  table↔drawer); its **internals adopt the kit's two-column anatomy** (left details panel + right tabbed
  feed Activity / Checklist / Notes).
- The **expand** control (`useExpandPref`, per-user-global, same URL) promotes the surface to the
  **full-width two-column record page**.
- **<1100px** is the modal sheet; **<768px** is the full-screen record page (scrim + focus trap + Esc +
  return-focus, unchanged from `TaskDrawer`).

**Why it is load-bearing:** it fixes the routing/state contract — there is exactly one record URL and one
component; widths are a presentation regime, not separate routes. This is the seam the larger MOS
(Projects / Objectives) reuses, so it is recorded as architecture, not styling.

**Consequences:** the existing `TaskSurface` / `TaskDrawer` / `TasksLayout` route topology is **kept
verbatim**. The revamp re-lays-out `TaskSurface`'s *internals* (left details + right feed); the
`drawer` / `full` width + `expanded` regimes and the `onTaskChanged` / `onTaskCreated` / `onTaskArchived`
host callbacks are unchanged. The right feed never carries a weekly-update write/ack affordance
(Lens-D guard A2 — this is a task, not the upward-review pane).

## Decision 4 — ⌘K command palette + the task-search read path (the one backend dependency)

The ⌘K trigger opens a real command palette (design-plan §5 Alt 5C): empty query → **Recent** +
**Quick actions** + **Navigate**; typing filters across **Navigate / Records / Actions**. The **Records**
group requires searching `mos.tasks` by title — **the one new read path of this revamp** (OD-P4-9 chose
record-search "in v1"; the design-plan §10 resolution notes it implies a search read path — the seam
decision below discharges that dependency).

**Seam decision (architecture level): a thin PostgREST title-filter query on the existing client, in
`@/lib/db/tasks.ts` — NOT a new RPC.** Rationale:

- The existing `listTasks` already reads `mos.tasks` via `supabase.schema('mos')` (ADR-0004), and the
  workspace already loads the full org-readable task set client-side at Gordi scale (~dozens of tasks,
  ~15 people). A title search is `mos.tasks.select('id,title,status').ilike('title', '%q%')` —
  **RLS is the authority** (the same row-visibility policy that governs `listTasks`), `org_id` is never
  sent by the client (the DB default stamps it; the workspace/org seam is unchanged), and the
  PostgREST profile already exposes `mos` (ADR-0004). No migration, no new SECURITY DEFINER function,
  no new RLS policy.
- A SECURITY DEFINER RPC would be the right seam **only** if search needed to bypass RLS, rank across
  schemas, or scale past what a single indexed `ilike`/`websearch` query serves. None hold at first-slice
  scale. **If/when** search must span Projects/Objectives or page beyond a few hundred rows, promote to
  an RPC (`mos.search_records(q text)`) — that is a future ADR, not this one.

The new function is `searchTasksByTitle(q: string, limit?: number): Promise<TaskTitleRef[]>` returning
the existing `TaskTitleRef` shape (`{ id, title, status }`). The detailed query + index decision is a
build task (plan PR-5). Because it reuses the existing RLS-governed read, **no pgTAP contract change is
required** unless the build adds a DB index or a new policy — the plan flags that conditional.

**Consequences:** the Records group is async (skeleton row while pending; scoped "Couldn't search
records." on failure — Navigate/Actions still work). Activation of a record opens `/tasks/:id` (Decision
3). The palette is a `role="dialog"` with a `role="combobox"`/`role="listbox"` body, focus trap, and
`aria-activedescendant` (focus stays in the input).

## Decision 5 — What is explicitly NOT changing

- **Data model:** `mos.tasks` and its columns, `task_events`, `task_checklist_items` — unchanged.
- **RLS:** every policy on `mos.*` is unchanged; the search read path rides the existing row-visibility
  policy. No new policy, no new grant.
- **`org_id` / workspace seam:** unchanged — the client never sends `org_id`; the DB default stamps it
  (ADR-0001 / ADR-0004). One shared Supabase, schema separation, unchanged.
- **Auth & roles:** RBAC (ADR-0011) and the viewer model are unchanged; edit/archive permissions
  (`taskPermissions.ts`) are unchanged.
- **Routing topology:** the `/tasks` split-view + nested `:taskId` / `new` outlet (ADR-0007) is kept.

---

## Consequences (rollout)

- Five surface PRs (shell · record table · record page · My Week · ⌘K palette) + a cross-cutting
  states/dark-mode AA PR, sequenced in the build plan. Each is independently shippable and
  behavior-preserving except the two net-new capabilities (the ⌘K palette + its search read path, and
  the My Week "My tasks" table being wired to real R/A data — today it is a hardcoded empty stub).
- The `TasksWorkspace.tsx` (~808 lines) decomposition (PR-2) is a quality/scalability upgrade with **no
  behavior change** — it must keep every existing AC green.
- Reversibility: Decisions 1–4 are presentation/state contracts (revertible by code, no data migration).
  The Decision-4 search seam is the only thing touching the data layer, and it adds a read-only function
  that reuses existing RLS — trivially revertible.
