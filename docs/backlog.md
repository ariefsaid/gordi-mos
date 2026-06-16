# Gordi MOS — backlog (living doc; created 2026-06-10)

The durable record of what's next. NOT loaded as session context (kept out of CLAUDE.md).
Phasing detail: `docs/roadmap.md`. Locked decisions: `docs/decisions.md`.

> **NEXT SESSION: read `docs/STATUS.md` first.** MVP is feature-complete (tasks+RACI · weekly updates ·
> Daily Log). Since then (Phase 3, 2026-06-13→16, all merged): **dev demo login (#13)**, **agentic
> workflow sync w/ PMO** (4-lens/Lens-D + `docs/jtbd.md`, model-discipline), **Tasks split-view redesign
> (#15→#18, ADR-0007)**, **CI-green clock fix (#16)**. The single remaining gap to a *usable* product is
> **▶ P3-1 production deploy** (ris-dev, owner-gated) — see "Phase 3" below. P2-4 stays owner-deferred.
> Git-hygiene: NEVER `git push origin HEAD:main` from a feature branch; rebase onto latest main before
> merging; feature code = branch → PR → merge; demo-login orphan → `supabase db reset` relinks.

## ✅ Phase 0 — frontend mockups (DONE)
- [x] **P0-1 — IA proposals.** `design-architect` → 2–3 competing static HTML shells for `/mos`
  (`docs/design-mockups/proposal-IA-<n>-<slug>.html`). Candidate shapes to explore: (a) left-rail +
  master-detail (PMO-like), (b) "My week" home-first (tasks + updates due on one landing surface),
  (c) feed-first (daily ops feed as home, tasks/updates as tabs). Each shows shell + nav + one
  populated screen, realistic Gordi data. Resolves WALL-1 into concrete options.
- [x] **P0-2 — Key-screen mockups.** My Tasks list · task detail · weekly update write + manager review ·
  daily ops feed. `docs/design-mockups/mock-<screen>.html` built; superseded by the shipped app (Phase 2).
- [x] **P0-3 — Owner IA pick.** DONE → OD-P0-6 (IA-8 balanced My Week) after two density redlines
  (OD-P0-7). Remaining gate items: home information inventory (OD-P0-8 pending) → re-cut the four
  key-screen mocks to density mode → owner signs off screens.

## ✅ Phase 1 — foundation (DONE)
- [x] P1-1 scaffold `mos-app/` + CI gates + Playwright harness — DONE, PR #1 merged (main@baafdc4).
- [x] P1-2 Supabase foundation — DONE, PR #2 merged (main@4f9ce7f): 6 migrations, 10 pgTAP files /
  41 assertions, ADR-0001, OD-P1-1..7 via grill session #1; security audit no-High/Critical, M1/M2/L3
  fixed. Coverage gate re-deferred to P1-3 (first real app logic).

- [x] P1-3 Auth — DONE, PR #3 merged: login (password+magic link), session, viewer/isManager,
  guards, orphan fail-closed, recovery flow (audit-L1 fix + e2e rotation proof). 59 unit (95% cov,
  gate live) · 7 e2e · 47 pgTAP. AC-006 amended (action-specific neutral copy).
- [x] P1-4 App shell — DONE, PR #4 merged: IA-8 rail/header/sections, My Week empty composition,
  mobile drawer, manager-conditional team module (e2e-proven w/ MANAGER fixture). 128 unit · 6
  curated e2e journeys (pyramid enforced: smoke deleted, AC-005b demoted) · 47 pgTAP. Local stack
  re-ported 55xxx→44xxx (macOS ghost reservation).

## Security-audit deferrals (from P1-2 audit, 2026-06-11 — neither blocks ship)
- **L4:** no acyclicity constraint on `shared.roles.reports_to_role_id` (evaluation is cycle-safe via
  UNION; data integrity by convention) → add CHECK/trigger when role-editing UI ships (Phase 2+).
- **L5 (extended by P1-3 audit):** the ris-dev production deploy issue (P3-1) MUST: disable open
  signup both keys (`enable_signup=false`; verify with a live self-signup probe expecting 422),
  consider the before_user_created hook as domain allowlist, raise password policy (≥8 +
  lower_upper_letters_digits), set session `timebox` (~24h) + `inactivity_timeout` (bounds stolen
  localStorage refresh tokens), keep CSP tight. ALSO: configure prod SMTP = **Resend**
  (OD-P1-11; setup runbook in supabase/README.md §Production email): owner verifies gordi.id in the
  Resend dashboard (SPF/DKIM DNS records) + provisions an API key into the prod env. Password login
  works without SMTP.

## ✅ Phase 2 — first slice (DONE; P2-4 owner-deferred)
- [x] P2-1 tasks + ownership + lightweight RACI (OD-DIR-5) — COMPLETE (3-PR split):
  - [x] P2-1a schema + RLS + data layer — PR #5 (mos.tasks, archive-gate, 41 pgTAP; security clean).
  - [x] P2-1b Tasks list page — PR #6 (filters, RACI rows, directory-resolved names, archived
    treatment, 768px reflow; 3-lens caught + fixed cross-schema embed bug). 220 unit · 7 e2e.
  - [x] P2-1c task detail + checklist + create + archive — PR #7 (inline status, editable R/A/C/I,
    checklist add/toggle/reorder/delete, activity log, archive/unarchive, read-only non-editor,
    loading/not-found/archived states). 252 unit · 9 e2e. **P2-1 COMPLETE.**
- [x] P2-2 weekly updates (write + manager review) — COMPLETE (3-PR split, grill #3 → OD-P2-10..14):
  - [x] P2-2a schema + upward-only RLS + data layer + week.ts — PR #8 (first non-org-readable entity;
    author-only write, submit-lock; security audit found+fixed a Critical — _test_seed_role_tree
    PUBLIC-EXECUTE RPC; CI definer-revoke lint added). 120 pgTAP · 282 unit.
  - [x] P2-2b write pane + ProgressMarker — PR #9 (summary + update lines w/ progress marker,
    Save draft/Submit/Reopen, submitted-locked, on-time/late; 3-lens caught a transparent-Submit
    Critical unit tests missed → fixed). 337 unit · 9 e2e. (CI: excluded flaky edge-runtime.)
  - [x] P2-2c manager review pane + My Week strip + team-module wiring + 2 e2e — PR #9-base + PR #10
    (review roster, read-only row-open per-person update, prior-week nav, filed/draft/not-started +
    on-time/late, My Week strip + team module wired to listTeamUpdates). **P2-2 COMPLETE.**
    NOTE: base P2-2c was accidentally pushed direct to main (git-hygiene slip); PR #10 rolled forward
    the bypassed review — 3-lens caught 3 Criticals incl. unimplemented FR-031 row-open. 396 unit · 11 e2e.
- [x] P2-3 Daily Log (daily ops feed, manual entry) — **COMPLETE** (3-PR split, grill → OD-P2-15..19;
  surface renamed "Ops Log" → "Daily Log" by owner 2026-06-12, OD-P2-15 amended):
  - [x] P2-3a schema + org-read RLS + data layer + wibDayRange — PR #11 (ops.log_entries, first
    ops-schema exposure; security audit found+fixed a High (created_by mutable) + Medium (cross-org
    refs) via a guard trigger). 152 pgTAP · 411 unit.
  - [x] P2-3b+c Daily Log feed + add/edit form + linked-task picker + My Week strip + 2 e2e —
    **COMPLETE** (merged PR #12). Recovered a killed-pi WIP + two bypassed reviews:
    `842cee6` route + editLogEntry camel→snake fix · `d9b3c20` spec+quality reviews (gpt-5.4) → TZ-bug
    fix + AC-067 un-bent + proof gaps · `45ba4cf` 3-lens design review (pi) → action-cluster overflow +
    44px phone targets + clear-filters + archived-calm · `633e368`/`6ab1bd1` Daily Log rename + strip
    verb fix. 460 unit · e2e AC-090/091 live · all gates green.
- [ ] P2-4 kitchen → `ops` mirror — DEFERRED (owner, 2026-06-12): revisit after tasks+updates+ops in real use; needs kitchen event shapes + integration seam. WALL-3 stays open.

## ✅ Phase 3 — shipped this session (2026-06-13 → 16, all merged to `main`)
- [x] **Dev demo login — PR #13.** Dev-only one-click 6-persona login (`DemoLogin.tsx` + `demoPersonas.ts`);
  accounts via `supabase/seed.dev-auth.sql` (relinks on `db reset`). Gated `import.meta.env.DEV` (never prod).
- [x] **Agentic workflow sync with PMO (Gordi context).** Lens D / 4-lens design review + `docs/jtbd.md`
  oracle (OD-P3 grill); code-quality DB-perf dimension; qa agent-browser note; playbook §3a series-default;
  CLAUDE.md model-discipline. (Verified non-gaps: PMO's "supabase skills" are dead symlinks; §3d surface-sync is PMO-only.)
- [x] **Tasks split-view redesign — PR #15 → #18** (OD-P3-2..5, **ADR-0007**). Table-default + push/squash
  split-view + Variant-B actionable drawer (pinned Status·R/A·Archive + Details/Checklist/Activity tabs) +
  expand-to-full-width (one `/tasks/:id`) + keyboard (j/k/Enter/o/Esc/n/e) + 3 responsive regimes
  (split ≥1100 · overlay 920–1100 · mobile <768) + virtualization (50+). `TaskDetail` 844→thin; `TaskSurface`
  the one editor; new `TasksLayout`/`TasksTable`/`TaskDrawer`/`TaskDrawerHeader`/`TaskTabStrip`. UI/routing only
  (no schema/RLS change). 584 unit · 6 e2e. PR-B's 4-lens render review caught 2 Criticals (expand+create/archive sync) → fixed.
  Residual polish (non-blocking): eyeball the 920–1100 overlay band live; the thin `TaskDetail`/`TaskCreate` hosts may be deleted.
- [x] **CI-green fix — PR #16.** Froze the clock in 3 date-relative weekly-update "late signal" tests
  (failed by run-date); test-only. `main` green on any date.

## ▶ NOW — Phase 3: production deploy (the only gap to a usable product)
- [ ] **P3-1 — ris-dev production deploy** to `https://ops.gordi.id/mos` (self-hosted Supabase + Caddy at `/mos`).
  **Owner-gated** (irreversible infra). Runbook: `docs/environments.md` (§Production deploy) + `supabase/README.md`
  (§Production email). Hardening before exposure (the **L5 checklist**, detailed under "Security-audit deferrals"
  below): disable open signup both keys + live 422 self-signup probe · password policy (≥8, mixed) · session
  `timebox` ~24h + `inactivity_timeout` · tight CSP · prod **Resend** SMTP (domain verified; key in 1Password
  vault `AS`). Also fold in the **L4** acyclicity CHECK if role-editing UI ships first. Password login works without SMTP.

## ✅ Tasks DB-view redesign — SHIPPED to `main` (PR #19, squash `e5686a9`, 2026-06-16)
Grill → mockup → 4-lens → build-spec grill → **3-PR build + fix-ups** → reviewed → e2e → merged.
**661 unit green · typecheck/eslint/build clean · ADR-0007 split-view oracle green · spec+code-quality
reviewed each phase · 4-lens render-verified (C1 Done-overdue, I1 keyboard-aria, M1 condensed-glyph fixed)
· AC-134 e2e PASS** (existing e2e green except AC-004/005 = pre-existing mailpit port-forward infra,
unrelated). Dev seed `supabase/seed.dev-tasks.sql` (11 demo tasks). Follow-ups (non-blocking):
M2 runtime desktop↔mobile resize re-subscribe; M3 re-confirm avatar grey live; reconcile the mockup to show
the kept Status-filter + Show-archived; optionally restore mailpit forwarding to re-green AC-004/005.
Decisions: **OD-P3-6** (full-bleed DB-view IA + grilled build-specs) · **OD-P3-7** (navy+orange brand amendment) ·
**OD-P3-8** (adopt `@tanstack/react-table` — headless row-models, full `TasksTable` refactor) in `docs/decisions.md`. Adopted
visual: `docs/design-mockups/tasks-dbview-final.html` — **A's chrome** (full-bleed · view-tabs · A's bordered
filter controls · thin **horizontal** gridlines only, no vertical "stripes") + **B's table simplicity** (clean
hairline group headers — NO navy bands, NO left-edge swatch) · **soft-tinted status chips** (DESIGN.md
"Tinted-Status Rule": In-Progress soft-blue, Blocked soft-red, Open soft-amber, Done soft-green) as the one
color element + overdue red dates · everything else **neutral grey** (grey owner avatars, flat-grey selected
row, no left stripe). 4-lens review verdict = **PASS, fix-then-ship, no Criticals** (no second mockup round).
- [ ] **Resume = design-plan + ADR-0008** (eng-planner/design-architect), then build phasing (owner-approved):
  **PR-1** DESIGN.md navy/orange token amendment + ADR-0008 → **PR-2** full-bleed layout (kill 1080 cap in
  `PageFrame.tsx` for data surfaces; keep prose capped) + view-tab scaffold (Board/Calendar **stubbed**) + toolbar
  restyle → **PR-3** **`@tanstack/react-table` refactor** + group-by engine + group headers (count + overdue subtotal),
  rendered with our markup over the existing `@tanstack/react-virtual` window.
- **Grilled build-specs (OD-P3-6):** group-by Status(default)/Owner/BU · within-group sort Due-asc · show ALL groups
  always · **bulk-select DEFERRED (no checkboxes v1)** · Person filter overrides Mine/RACI/All segment · mobile =
  grouped cards · view/group/collapse persisted per-user-global · client-side row models · no column-customization v1.
- **Fold into the design-plan (review "Important"):** (1) all states — loading/empty/error/no-results/
  zero-overdue header (empty-group N/A — groups always shown); (2) **"+N" RACI tooltip** (silent glyph → reveal C/I
  on hover/focus). *(Was #2 bulk-select toolbar → dropped, bulk-select deferred. Was #3 Mine/Person → resolved:
  Person overrides segment.)*
- **design-architect notes (review "Minor"):** make "3 overdue"/group subtotals **click-to-filter**; codify status
  **dot ≥8px + text label always** (no dot-only variant — keeps WCAG 1.4.1 when grouping ≠ Status); document
  **50px rows** vs DESIGN.md 54px; bless the **navy→blue avatar gradient** in the amendment (doc says blue→violet).
- **Regression-invariants to test when built:** RI-1 one canonical task home regardless of entry; RI-2 inline
  status change with no view transition; RI-3 every chip renders its text label; RI-4 off-track signal in the row;
  RI-5 role-stable nav/breadcrumb.
- Sibling mockups (context): `tasks-dbview-A.html` (louder), `tasks-dbview-B.html` (Notion-quiet).

## Doc & code debt (non-blocking — from the 2026-06-16 fresh-eyes audit)
- [x] **Fold AC-100..134 into the spec — DONE 2026-06-16.** Authored `docs/specs/tasks-dbview.spec.md` (the
  Tasks UI spec layered on the `tasks-raci` data model): FR-100..109 + FR-120..128, NFR-120..124, OBS-120..122,
  AC-100..134, + an extends/supersedes mapping for the `tasks-raci` FRs the redesign changed (FR-022/023/024/026/030/031).
  Pointer added to `tasks-raci.spec.md`. (Was: split-view + DB-view ACs were plan-only.)
- [ ] **ADR-0007 Decision snippet uses pre-impl names** (`TasksSplitView`/`TaskSurface` children); as-built is
  `TasksLayout` + `TaskDrawer`(→`TaskSurface`). Add an "As-built" note to the ADR. (The plan header is already corrected.)
- [x] **Removed genuinely-dead `TaskNewPlaceholder.tsx` (+test)** — merged `38d6dcd` 2026-06-16 (unrouted, self-test-only).
- [x] **Pruned the thin host trio `TaskDetail`/`TaskCreate`/`TasksPage` — DONE, merged `01f9ce1` 2026-06-16.**
  All three were dead test-oracles; their AC tests were **re-homed onto the live surfaces** (TaskDetail/Create
  → `TaskSurface` view/create mode; TasksPage tests → `TasksWorkspace`/`TasksLayout`) with **assertions
  unchanged** (AC-004/007/008/060-067/070-075/080-081 preserved, delta 0 tests = 660), then the hosts deleted.
  Built via a **result-based GLM-manager dispatch** (`docs/pi-delegation.md` §3e/§4a) — Director verified the
  outcome independently (gates re-run, diffs BDD-clean) + merged. *(Tiny residual: comment-only mentions in
  `OpsAddForm.tsx` / a stale `TaskDetail.css` comment in `WeeklyUpdateWritePane.css` / CSS-provenance notes —
  harmless, sweep whenever.)*
- [ ] **`docs/environments.md` P3-1 section is a stub** — write the actual ordered ris-dev deploy runbook before P3-1.
- [ ] **Decouple e2e fixtures from the demo personas (recurring demo-login orphan).** The Playwright
  global-setup reuses the SAME `shared.people` rows as the one-click demo personas (`40000000-…-00N`,
  emails `*.dev@example.test`) and re-points their `user_id` to e2e auth users (e.g. it links person
  `…-000`/Dewi to the e2e MANAGER uid). So **every e2e run breaks the demo login** ("Your account isn't
  set up yet"). Quick recovery: `UPDATE shared.people p SET user_id=a.id FROM auth.users a WHERE
  p.email=a.email AND p.email LIKE '%.dev@example.test';` (or `supabase db reset`). **Permanent fix:** give
  e2e its own person ids / org (or its own emails) so global-setup never touches the `*.dev` demo rows.
- Note: `docs/plans/archive/` now holds the 11 completed Phase-1/2 plans; the 2 Phase-3 `2026-06-15-tasks-redesign*`
  plans stay at `docs/plans/` top level (most-recent reference). All shipped plans are historical records.

## 🧱 THE WALL — open owner decisions (do not guess; escalate or skip)
- ~~WALL-1 — first navigation IA~~ CLOSED → OD-P0-6 (balanced My Week, proposal-IA-8) + OD-P0-7 (density mode in DESIGN.md).
- ~~WALL-2 — app name~~ CLOSED → OD-P0-4 ("Gordi MOS", subtitle "Management OS").
- **WALL-3 — Which kitchen events mirror into MOS first.** Needed before P2-4 spec.
- **WALL-4 — Daily ops updates: generic vs kitchen-specific `ops` schema.** LOW-stakes until P2-4: with
  P2-4 deferred + P2-3 manual-entry-only, no external writer is locked to the schema, so it's cheap to
  change before any integration. Director recommendation = generic typed events; confirm at P2-3 resume.

## Polish / follow-ups

- **P2-1a quality deferrals (from retroactive code-quality review, 2026-06-11 — non-blocking):**
  pgTAP fixture duplication across tests 13–16 → extract a `mos._test_seed_role_tree()` helper (or
  `tests/_fixtures.sql`) so the role-tree exists once. · `getTask` does 3 serial round-trips → parallelize
  the independent checklist+events reads (`Promise.all`) when TanStack lands, or fold into a future
  SECURITY DEFINER RPC. · `as unknown as` casts on the two PostgREST-embed reads in `tasks.ts` → optional
  boundary `assertTaskListRow` if the hand-synced `mos` types ever drift.
- UserChip menu: add outside-click dismissal (standard popover behavior; Esc-only today) — from P1-4 quality review.
- **auth-recovery.spec.ts e2e flake** (pre-existing since P1-3): intermittent mailpit timing failure
  under full-suite load; passes in isolation + in CI. Stabilize (poll mailpit w/ retry, or isolate the
  recovery mailbox) so it can't mask a real regression.
- **P2-1c polish deferrals (non-blocking):** create-form R/A use native `<select>` not the detail
  role-chip picker (consistency) · extract a shared `<PersonField>`/`<PersonAvatar>` primitive when a
  3rd consumer appears (P2-2 weekly updates likely) · generalize `ConfirmArchive` → reusable
  `ConfirmDialog` for future destructive flows · `PersonPicker` empty state when all excluded.
- **P2-2a quality deferrals (non-blocking, from code-quality review):** migrate pgTAP fixtures in
  tests 14/16 onto the new `mos._test_seed_role_tree()` helper (one role-tree definition org-wide) ·
  **(broadened by P2-3a)** lift the `schema(name)` client + `throwOnError(label,{data,error})` wrapper
  (now hand-repeated across tasks.ts/weeklyUpdates.ts/opsLog.ts, ~20 call-sites, 2 schemas) into a
  schema-agnostic `db/client.ts` — do it at the first `ops` UI consumer (P2-3b) with both schemas in
  view · optional `wibMondayUTC(now)` DRY across week.ts pure fns.
- **mos.tasks cross-org `business_unit_id` (security Medium twin, from P2-3a audit):** `mos.tasks`
  accepts a foreign-org `business_unit_id` (existence-only FK, no org-match) — the same gap P2-3a
  closed on `ops.log_entries`. Pre-existing, UUIDv4-throttled, single-tenant-today (not a regression).
  Close it with a same-org ref guard mirroring `ops._guard_log_entry` when next touching mos.tasks.
- **P2-3a scale-only:** the feed filter indexes are `(org_id, col)` but the feed sorts `occurred_at
  desc` — a `(org_id, business_unit_id, occurred_at desc)` composite would help only at large row
  counts. Immaterial at Gordi scale; revisit if the Ops Log grows large.
- **P2-2c — transitive / CEO-org-wide review roster** (deferred, Director-decided 2026-06-12): the
  review pane roster lists DIRECT reports (FR-030 amended). Revisit when the org grows past 2 levels
  or the CEO wants an org-wide weekly-update roster — make `team.ts` resolve the transitive subtree
  (mirror `is_manager_of`) or add a `mos.my_team_person_ids()` RPC. Moot today (flat org).
- **P2-2b polish deferrals (non-blocking):** extract a shared `<TintPill variant>` primitive — the
  3rd tinted-pill now exists (ProgressMarker.css ≈ StatusPill.css ≈ TimingChip inline) · migrate the
  write-pane inline-style blocks to co-located CSS (consistency w/ tasks/ pattern) · marker-picker
  popover up-flip when near the bottom of the list.

## Deferred (post-MVP — see roadmap "Post-MVP")
Objectives/outcomes · programs/processes · SWPs · RACI matrix UI · OKR cascade · kitchen migration ·
roastery app · ESB write-back visibility · shared UI package extraction.
