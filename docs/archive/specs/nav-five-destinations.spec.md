# Spec — Five-destination nav shell: regroup + Work-spine absorption

- Status: **Draft** (eng-planner, for spec-reviewer + owner sign-off). Plan: `docs/plans/2026-07-07-nav-five-destinations.md`.
- Source decisions:
  - **ADR-0019** D2 (five destinations), D8 (phone-first + bottom tabs), D12 (bilingual i18n seam), D14-step-3 (Work spine sequencing).
  - **`docs/jtbd.md` §2** — the destination × job rows: what content each destination owns (Home cockpit + My Week panel; Work = tasks/cascade/follow-ups/updates; Operate = per-Activity modules + Daily Log; Plan = reference/money-lens; Inbox = triage).
  - **`docs/decisions.md`** — "Continued IA/product grill — session 2 (2026-07-06)": the **Catalog placement** refinement (catalog → Work manage-mode, up/down-traceable, retire standalone `/objectives` + `/projects-processes` nav, direct visits redirect into the Work cascade, reuse the existing pages not an inline tree); **Home stacked-union**; **Marketing/HR reach** (no Operate module — they live in Work/Home/Plan/Inbox). Also **OD-C-1 / OD-C-2** (the catalog's origin as "two nav items under Workspace").
  - **ADR-0020** (capability authorization `can()` — the catalog manage-mode gate; carried by the held Work-spine branch).
  - **ADR-0021** (typed hand-rolled i18n catalog seam).
- Vocabulary: `CONTEXT.md` — Home, Work, Operate, Plan, Inbox (§ Surfaces); Objective, Project/Process, Task, Activity (§ Cascade); Access role / Capability.
- Extends (does **not** duplicate or contradict):
  - `docs/specs/home-v1.spec.md` — the DESTINATIONS model + the bottom-tab shell + the i18n seam (FR-Sxx, AC-Sxx). This slice **completes** that model (home-v1 landed the shell with Work=Tasks-only, Plan/Inbox empty, Sales drill-only — all temporary).
  - `docs/specs/work-spine.spec.md` (held, `feat/work-spine` `0bf7cdd`) — the everyone cascade view + the `can()` substrate + pgTAP 72/73. This slice **consumes** the cascade as Work's content and **supersedes** that spec's FR-310–313 (see §2 + the plan's § Work-spine reconciliation).
  - `docs/specs/cascade-catalog.spec.md` — the existing Objectives + Projects & Processes **manage** behaviors (create / rename / archive). This slice **reuses** those pages unchanged as Work's manage-mode.

> **No schema change.** This is an **additive UI regroup** of already-shipped routes + pages (FR-400 intro). The one schema touch — the `shared.can()` capability migration (`20260708000001` + `20260708000002`) — is **carried by the held `feat/work-spine` branch** and arrives via the plan's § Work-spine reconciliation, not authored by this slice. This slice adds **zero** migrations of its own.

## 1. Overview & JTBD

The five-destination IA (Home · Work · Operate · Plan · Inbox) is **Accepted** (ADR-0019 D2). The shell scaffolding already exists: `destinations.tsx` exports the five destinations, and both the desktop rail (`rail-nav.tsx`) and the phone bottom-tab bar (`bottom-tab-bar.tsx`) render from it. But the regroup is **incomplete and partly wrong** — the destinations model still reflects the home-v1 *temporary* state, not the accepted IA:

- **Work** wrongly holds **Daily Log** (should be **Operate** per jtbd §2); it lacks the **cascade** everyone-view (held on `feat/work-spine`).
- **Operate** holds only the Kitchen module; **Daily Log** is missing.
- **Plan** is empty; **Sales** is still "drill-only from Home" (the home-v1 temporary posture), not a visible Plan destination.
- The **catalog** (Objectives + Projects & Processes) is still a separate **"Catalog" nav group** below the destinations — a vestige of the pre-IA OD-C-2 "two nav items under Workspace." Per the 2026-07-06 Catalog-placement refinement, it must become **Work's manage-mode**, reachable only from the cascade.

This slice completes the regroup into the accepted IA and absorbs the held **Work spine** (cascade everyone-view + the `can()` substrate) so Work is whole. It is a **REGROUP**, not a from-scratch shell: every route, page, and component already ships; this slice reassigns them to destinations, retires the standalone catalog nav, relocates the catalog manage routes under `/work/` as the cascade's manage-mode, and adds the up/down **trace context** the decisions.md refinement requires.

**Primary JTBD** (jtbd §2 Work / Operate rows): *as any org member, I find the work surface I need by **destination → surface** (not a flat screen list), and I can trace how my work ladders up to the org's goals from one Work surface — the cascade — with the catalog managed in-place from that same surface, not orphaned under a separate nav group.* The nav is the wayfinding layer for the whole-company OS; a stale flat grouping that no longer matches the IA is a daily tax on ~30 people.

**Quality bar** = the shipped rail / bottom-tab grammar (records-workspace selection, hairline group headers, `aria-current`, `text-muted-foreground` label ramp AC-D02). No new chrome, no new visual language.

**Non-dead-end invariant** (jtbd §3.10, anchor A4 applied to nav): a destination with no visible children for a role is itself hidden; a sub-item a role can't use is not shown. Nav is **wayfinding convenience** — RLS + `can()` are the real boundaries (FR-411).

## 2. Scope — the destination map (today → after this slice)

| Destination | Today (`dev`) | After this slice | Routes |
|---|---|---|---|
| **Home** | `/` cockpit + My Week panel ✓ | **unchanged** | `/` |
| **Work** | Tasks, Weekly Updates, **Daily Log** ✗ | Tasks, **Cascade** (absorbed), Weekly Updates; Daily Log **moved out**; Follow-ups = future (not rendered) | `/tasks*`, `/work/cascade`, `/updates`; manage-mode `/work/objectives`, `/work/projects-processes` |
| **Operate** | Kitchen module only | Kitchen module **+ Daily Log** (moved in from Work) | `/kitchen/*`, `/ops` |
| **Plan** | empty; Sales drill-only | **Sales dashboard** (finance/admin) now; budget/COGS later (not rendered) | `/sales` |
| **Inbox** | `/inbox` when `SHOW_INBOX` ✓ | **unchanged** | `/inbox` |
| ~~Catalog nav group~~ | separate group, role-gated | **RETIRED** — catalog is Work's manage-mode | (relocated under `/work/`) |

**Supersedes (held Work-spine FR-310–313).** The held `feat/work-spine` spec (Accepted, OD-WS-1) treats the catalog manage pages as standalone `/objectives` + `/projects-processes` routes linked from an inline Manage affordance, and they remain top-level nav under a "Catalog" group. The 2026-07-06 Catalog-placement refinement (decisions.md) supersedes that:

- **(a)** retire the standalone catalog **nav** (no top-level `/objectives` + `/projects-processes` nav entry; the "Catalog" rail group is removed) — the catalog is reachable **only from the Work cascade**;
- **(b)** relocate the manage routes **under `/work/`** (`/work/objectives`, `/work/projects-processes`) so they are genuinely "in the Work folder," with the old top-level paths becoming **redirects into the cascade** (`/objectives` → `/work/cascade`);
- **(c)** each manage page shows the node's **up/down trace context** (an objective → its child work_lines + task count; a project/process → its parent objective(s) + task count) — **reusing the existing pages + the cascade data, not rebuilding as an inline tree** (YAGNI; the held branch's FR-312 already reuses the catalog behavior — this adds the trace read).

The held branch's `can()` substrate, cascade page, and pgTAP 72/73 are **kept**; only FR-310–313's "manage links out to flat standalone pages" posture is superseded. See the plan's § Work-spine reconciliation for the exact rebase sequence.

## 3. Functional requirements (EARS)

> ID range **4xx** chosen to avoid collision with cascade-catalog (0xx/1xx), cascade-foundation (2xx), work-spine (3xx), home-v1 (Hxx/Sxx).

### The five destinations as top-level nav (replacing the flat grouping)
- **FR-400** — The system shall render top-level navigation as exactly the five destinations (**Home · Work · Operate · Plan · Inbox**) on **both** chromes — bottom tabs on phone, rail groups on desktop — sourced from the single `DESTINATIONS` model (`mos-app/src/shell/destinations.tsx`), replacing the flat `SECTIONS`-driven grouping inherited from home-v1 (ADR-0019 D2/D8).
- **FR-401** — The **Home** destination shall own `/` (the role-aware cockpit + My Week panel) and be live for every authenticated viewer (no gate). *(Restated binding — already correct; unchanged by this slice.)*
- **FR-402** — The **Work** destination shall own, in order: **Tasks** (`/tasks*`), the **Cascade** everyone-view (`/work/cascade`), and **Weekly Updates** (`/updates`, when `SHOW_WEEKLY_UPDATES`). **Daily Log shall not appear under Work.** **Follow-up queues are a documented future link, not rendered in this slice** (deferred to the AR/pending-bills bridge, ADR-0019 D14 step 4 — honor no-dead-end).
- **FR-403** — The **Operate** destination shall own the **Daily Log** (`/ops`, moved here from Work) and the **Kitchen module** (`/kitchen/*`), grouped per-Activity (Kitchen today; Bar/Roastery/Ecommerce as captured).
- **FR-404** — The **Plan** destination shall own the **Sales dashboard** (`/sales`), gated to `finance` + `admin`, as the reference/money-lens destination. Budget/COGS workbenches are a documented future link, not rendered in this slice. *(This supersedes home-v1's "Sales is drill-only from Home KPI" posture — FR-Sxx §2.5 — per the IA: Plan is now a real destination with content.)*
- **FR-405** — The **Inbox** destination shall own `/inbox`, live when `SHOW_INBOX` (ADR-0019 D9). *(Restated binding — already correct.)*

### Role-gating + no-dead-end
- **FR-410** — When a destination has **no visible child link** for the viewer's access roles (after applying each link's gate), the system shall **hide that destination** entirely from both the rail and the bottom-tab bar (no empty group, no dead-end tab).
- **FR-411** — A hidden nav entry shall be **convenience only**; the route guard (`RequireAccessRole` / `RequireCapability`) and **RLS / `can()` shall independently** deny an unauthorized viewer (RLS is the real boundary — ADR-0011 D5 / ADR-0020 D4). A destination/sub-item vanishing from nav for a role must not weaken the data boundary.

### Catalog = Work's manage-mode (supersedes held FR-310–313)
- **FR-420** — The system shall render **no** standalone **Catalog nav group** for any role; the objectives + projects/processes **manage** surfaces are reachable **only** from the Work cascade's Manage affordance (capability-gated), not from top-level nav (retires OD-C-2's "two nav items under Workspace").
- **FR-421** — The manage routes shall live **under `/work/`**: `/work/objectives` (capability `objective.manage`) and `/work/projects-processes` (capability `workline.manage`), reusing the existing `ObjectivesPage` + `ProjectsProcessesPage` components unchanged. A **direct visit** to the retired top-level paths (`/objectives`, `/projects-processes`) shall **redirect into the cascade** (`/work/cascade`, `replace`), matching decisions.md's "reachable only from the Work cascade."
- **FR-422** — Each manage page shall show the node's **up/down trace context**, computed from existing cascade data (no schema change): an **objective** → its **child work_lines + the task count** per work_line; a **project/process** → its **parent objective(s)** (inferred from task linkage — `work_lines` has no `objective_id` column; the parent is the set of objectives that tasks under this work_line point to) + the task count. The trace is a read over `listTasks` + the catalog loaders, rendered as a small context block; the existing create/rename/archive behavior is unchanged.
- **FR-423** — The cascade's **Manage affordance** shall link to the relocated `/work/objectives` and/or `/work/projects-processes` routes when the viewer holds the matching capability (`objective.manage` / `workline.manage`); when the viewer holds **neither**, no Manage affordance shall render (no dead-end page).
- **FR-424** — The **breadcrumb** shall resolve every Work-manage and Plan route through its owning destination: `/work/objectives` reads "**Work › Objectives**", `/work/projects-processes` reads "**Work › Projects & Processes**", `/sales` reads "**Plan › Sales**", `/ops` reads "**Operate › Daily Log**" (extends home-v1 FR-S03; the retired `/objectives` + `/projects-processes` paths never resolve — they redirect per FR-421).

### i18n (every nav string through the catalog)
- **FR-440** — Every user-facing **nav string** — destination labels **and** sub-item labels (Tasks, Cascade, Weekly Updates, Daily Log, the Kitchen Log/Plan/Stock/Review/Pushes items, Sales, the relocated Objectives / Projects & Processes) — shall resolve through the typed i18n catalog (`mos-app/src/i18n/messages.ts` + `useT()`) via each `Section.labelKey`, with `en` and `id` keys of identical shape (ADR-0019 D12 / ADR-0021). *(Extends the home-v1 "new strings only" posture to a one-time nav sweep — retrofitting 50 surfaces later is the expensive path the ADR names.)*

### States
- **FR-450** — Each destination and sub-item shall express **loading** (skeleton), **empty** (empty-state copy via the catalog), and **gated** (absent from nav + route-guard-denied) states without a page-level crash; the cascade's existing empty/error/loading states (work-spine FR-321) are reused for Work's cascade link.

## 4. Non-functional requirements

- **NFR-400 (phone-first — ADR-0019 D8).** The five destinations render as **≤5 bottom tabs** on phone. With `SHOW_INBOX` on, the maximum is exactly five (Home/Work/Operate/Plan/Inbox); a role with no Plan children (e.g. a `member`) sees four. No desktop-only path to a destination.
- **NFR-401 (bilingual — ADR-0019 D12 / ADR-0021).** Every nav string flows through the typed catalog; an `en`/`id` key-parity test is required. The catalog keys are additive (no existing key renamed).
- **NFR-402 (no schema change).** This slice adds **zero** migrations. The `can()` substrate arrives via the held Work-spine reconciliation (plan §). Trace context (FR-422) is computed over already-shipped columns (`tasks.objective_id`, `tasks.work_line_id`).
- **NFR-403 (no-dead-end).** A destination/sub-item with no authorized child never leaves an empty group or a dead tab (FR-410).
- **NFR-404 (reuse — do not rebuild).** Every page is reused: `ObjectivesPage` + `ProjectsProcessesPage` (manage-mode, + trace), `CascadePage` (held branch), `SalesDashboardPage`, `OpsPage`, the Kitchen pages. No second task editor, no inline cascade tree (held work-spine NFR-303 carries).
- **NFR-405 (coverage / gates).** ≥80% lines on changed code; tests assert behavior. `npm run typecheck` zero errors; ESLint `--max-warnings=0` zero errors. Both block merge (AGENTS.md).
- **NFR-406 (a11y — WCAG-AA).** Active destination + active sub-item carry `aria-current="page"`; label/meta roles use the `text-muted-foreground` (tertiary) ramp, never the failing light ramp (home-v1 AC-D02); icons stay `aria-hidden`.
- **NFR-407 (no-bleed).** Long nav/breadcrumb text ellipsizes (home-v1 AC-S02/S03, OD-P4-11); nav never overflows the shell.

## 5. Non-goals (v1 fence)

- **Follow-up queues / B2B AR / retail pending bills** — ADR-0019 D5 / D14 step 4; gated on the ESB spike (LIKELY-NOT) + the D13 backup drill. Not this slice; no Work nav entry until then.
- **Budget / COGS / reference-data workbenches under Plan** — ADR-0022 / D14 step 5; the Sales dashboard is Plan's only content this slice. No Plan stub links (no dead-ends).
- **Home redesign, Operate activity roll-ins (bar/roastery/ecommerce), the agent/deputy panel, Inbox producers** — other slices / destinations; untouched.
- **The admin-editable-roles UI** (ADR-0020 D2) — the `can()` UI is the held branch's deferral; this slice consumes the seeded grants only.
- **Per-entity comments / @mentions on objectives & work_lines** (ADR-0019 D4) — additive later.
- **Any change to the cascade page internals, the task editor, or the shell grid chrome** — this slice reassigns routes/labels and adds a trace read; it does not reshape the shell.
- **Retrofitting i18n across non-nav surfaces** — only nav strings this slice (FR-440); the rest is the incremental sweep the ADR names.

## 6. Nav contract (role → visible destinations/links)

The nav is a **derived view** of `DESTINATIONS` × the viewer's access roles × the feature flags. A link is visible iff its gate (if any) is satisfied and its feature flag (if any) is on; a destination is visible iff ≥1 of its links is visible.

| Role (illustrative) | Home | Work | Operate | Plan | Inbox (`SHOW_INBOX`) |
|---|---|---|---|---|---|
| `member` (floor) | ✓ | Tasks, Cascade, Updates | Daily Log, Kitchen (Log/Plan/Stock) | — (hidden) | ✓ |
| `ops_lead` | ✓ | Tasks, Cascade, Updates | Daily Log, Kitchen (all 5) | — (hidden) | ✓ |
| `finance` | ✓ | Tasks, Cascade, Updates | Daily Log, Kitchen (Log/Plan/Stock) | **Sales** | ✓ |
| `admin` | ✓ | Tasks, Cascade, Updates (+ manage-mode via cascade) | Daily Log, Kitchen (all 5) | **Sales** | ✓ |

**Manage-mode visibility** is keyed on **capability**, not role nav: `objective.manage` (admin) → the cascade's "Manage objectives" affordance → `/work/objectives`; `workline.manage` (ops_lead, admin) → "Manage projects & processes" → `/work/projects-processes`. A capability-holder reaches manage-mode **only** from the cascade (FR-423); there is no manage link in the rail (FR-420).

## 7. Open decisions for owner / Director sign-off

- **(a) Relocate manage routes under `/work/` vs keep top-level + retire nav only.** Recommend **relocate** (`/work/objectives`, `/work/projects-processes`) — it most literally satisfies decisions.md's "genuinely in the Work folder, not a separate destination" and yields the "Work › Objectives" breadcrumb (FR-424) for free. Cost: update the held branch's cascade Manage-affordance links + its e2e (plan § reconciliation). Alternative (keep top-level, retire nav only, redirect direct visits) is less churn but leaves a topologically separate route. *Confirm relocate.*
- **(b) Old `/objectives` + `/projects-processes` redirect target.** Recommend **→ `/work/cascade`** (decisions.md: "direct visits redirect into it"). A capability-holder who bookmarks the old path lands on the read-only cascade, then taps Manage. *Confirm.*
- **(c) Follow-up queues nav entry.** Recommend **not rendered** this slice (deferred to the AR bridge, D14 step 4) — no dead-end. *Confirm.*
- **(d) i18n sweep scope.** Recommend **all nav labels** (FR-440) — the brief asks for it and it's the cheap moment. *Confirm.*
- **(e) Sales nav entry supersedes home-v1's "drill-only" posture.** This is a **deliberate change** (home-v1 §2.5 made Sales drill-only because Plan was empty; Plan is now a real destination). *Confirm the change is intended.*
- **(f) Daily Log placement within Operate.** Recommend **Daily Log first** (the cross-Activity chronological feed, most general), then the Kitchen module. *Confirm ordering.*
- **(g) Feature-flag posture at merge.** The held `feat/work-spine` flips all flags to `false` (local-test convenience). Recommend resolving the reconciliation conflict to **`true`** (dev's posture) so all five destinations render — confirm the rollout wants the full IA visible.

## 8. Acceptance criteria (Given / When / Then — each tagged with its owning test layer)

> Test pyramid. This slice has **no schema change** → **no pgTAP authored here** (the `can()`/RLS tests 72/73 belong to the held Work-spine branch and arrive via reconciliation, referenced not duplicated). Each AC owned by ONE test: Unit (Vitest/RTL, mocked) for structure/gating/render; E2E (Playwright) for the cross-stack journey. AC-ids tagged in the owning test title so `grep -r AC-4XX` finds the proof.

### Structure + gating — unit (Vitest/RTL, mocked)
- **AC-400** *(FR-400/401/402/403/404/405, unit)* — *Given* the `DESTINATIONS` model, *Then* it exports exactly five destinations in order `home, work, operate, plan, inbox`; Work's live links are `[Tasks, Cascade, Updates(when flag)]` with **no** Daily Log; Operate's live links include **Daily Log** and the Kitchen items; Plan's links are `[Sales]` gated `finance`+`admin`; Home is `/`; Inbox is `/inbox` when its flag is on.
- **AC-401** *(FR-402/403, unit)* — *Given* the model, *Then* `/ops` resolves to the **Operate** destination (not Work) for both `destinationForPath` and bottom-tab `isDestinationActive`.
- **AC-402** *(FR-404/410, unit)* — *Given* a `finance` viewer, *Then* the Plan destination is **live** (Sales link visible); *given* a `member` viewer, *Then* Plan is **not live** (hidden — `isLive` false), so no Plan tab/rail group renders.
- **AC-403** *(FR-410, unit)* — *Given* a destination whose every link is gated off for the viewer, *Then* `isLive` returns false and the rail/bottom-bar render no group/tab for it (no dead-end).
- **AC-404** *(FR-420, unit)* — *Given* any role (incl. `admin`), *When* the rail renders, *Then* **no** "Catalog" group label appears and **no** Objectives / Projects & Processes links appear as top-level nav.
- **AC-405** *(FR-421, router unit)* — *Given* the router config, *Then* `/objectives` and `/projects-processes` are **redirect** routes to `/work/cascade` (`replace`); `/work/objectives` + `/work/projects-processes` render the manage pages behind `RequireCapability`.
- **AC-406** *(FR-422, unit)* — *Given* mocked cascade data (objective O → work_line W → 3 tasks), *When* `ObjectivesPage` renders, *Then* it shows W + "3 tasks" under O (down-trace); *when* `ProjectsProcessesPage` renders, *Then* it shows O as W's parent objective + task count (up-trace) — both via the existing catalog loaders + `listTasks`, no new data layer.
- **AC-407** *(FR-423, unit)* — *Given* a viewer with `workline.manage` only, *When* the cascade renders, *Then* the Manage affordance links to `/work/projects-processes` and **not** to objectives; *given* a viewer with **neither** capability, *Then* no Manage affordance renders.
- **AC-408** *(FR-424, unit)* — *Given* the breadcrumb at `/work/objectives`, *Then* it reads "Work › Objectives"; at `/sales` → "Plan › Sales"; at `/ops` → "Operate › Daily Log".
- **AC-409** *(FR-440, NFR-401, unit)* — *Given* locale `id`, *When* the rail renders, *Then* every nav label (destinations + sub-items + manage leaves) yields its `id` catalog string (no hardcoded English leaks); the `en`/`id` key sets are shape-identical (parity test).

### Cross-stack — end-to-end (Playwright)
- **AC-410** *(FR-400/402/403/404/410, e2e — the five-destination phone shell)* — *Given* a signed-in `finance` viewer on a phone viewport, *When* the shell renders, *Then* the bottom-tab bar shows the five tabs (Home/Work/Operate/Plan/Inbox) with **no Catalog**; *given* a `member`, *Then* the **Plan** tab is absent (4 tabs). Active destination + active sub-item carry `aria-current="page"`.
- **AC-411** *(FR-420/421/422/423, e2e — catalog is Work's manage-mode)* — *Given* an `admin` signed in, *When* they navigate **Work → Cascade → Manage objectives**, *Then* they land on `/work/objectives` with the down-trace (child work_lines + task counts) visible; *when* they visit `/objectives` **directly** (typed/bookmarked), *Then* they are redirected to `/work/cascade`.

### FR → AC coverage (every FR has ≥1 AC)
FR-400→AC-400/410 · FR-401→AC-400 · FR-402→AC-400/401 · FR-403→AC-400/401/410 · FR-404→AC-400/402/410 · FR-405→AC-400 · FR-410→AC-402/403/410 · FR-411→AC-405 (route-guard) + held pgTAP 72/73 (RLS authority, via reconciliation) · FR-420→AC-404/410 · FR-421→AC-405/411 · FR-422→AC-406/411 · FR-423→AC-407/411 · FR-424→AC-408 · FR-440→AC-409 · FR-450→**gated** state proven by AC-402/403 (destination hidden when no authorized child); **loading/empty** states are inherited from the reused pages' own existing tests (ObjectivesPage/ProjectsProcessesPage/SalesDashboard/Ops/Kitchen) + the cascade's states (work-spine FR-321) — not re-proven in this slice (the slice reassigns routes/labels, it does not reshape page states, NFR-404).

---

SPEC-DONE
