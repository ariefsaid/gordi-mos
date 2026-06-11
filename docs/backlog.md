# Gordi MOS — backlog (living doc; created 2026-06-10)

The durable record of what's next. NOT loaded as session context (kept out of CLAUDE.md).
Phasing detail: `docs/roadmap.md`. Locked decisions: `docs/decisions.md`.

## ▶ NOW — Phase 0: frontend mockups
- [ ] **P0-1 — IA proposals.** `design-architect` → 2–3 competing static HTML shells for `/mos`
  (`docs/design-mockups/proposal-IA-<n>-<slug>.html`). Candidate shapes to explore: (a) left-rail +
  master-detail (PMO-like), (b) "My week" home-first (tasks + updates due on one landing surface),
  (c) feed-first (daily ops feed as home, tasks/updates as tabs). Each shows shell + nav + one
  populated screen, realistic Gordi data. Resolves WALL-1 into concrete options.
- [ ] **P0-2 — Key-screen mockups.** My Tasks list (RACI-visible, filterable) · task detail (RACI
  fields + status + updates) · weekly update write + manager review · daily ops feed (kitchen-mirrored
  events). `docs/design-mockups/mock-<screen>.html`.
- [x] **P0-3 — Owner IA pick.** DONE → OD-P0-6 (IA-8 balanced My Week) after two density redlines
  (OD-P0-7). Remaining gate items: home information inventory (OD-P0-8 pending) → re-cut the four
  key-screen mocks to density mode → owner signs off screens.

## ▶ NEXT — Phase 1: foundation (blocked on P0-3)
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

## ▶ LATER — Phase 2: first slice (blocked on Phase 1)
- [~] P2-1 tasks + ownership + lightweight RACI (OD-DIR-5) — IN PROGRESS (3-PR split):
  - [x] P2-1a schema + RLS + data layer — PR #5 (mos.tasks, archive-gate, 41 pgTAP; security clean).
  - [x] P2-1b Tasks list page — PR #6 (filters, RACI rows, directory-resolved names, archived
    treatment, 768px reflow; 3-lens caught + fixed cross-schema embed bug). 220 unit · 7 e2e.
  - [x] P2-1c task detail + checklist + create + archive — PR #7 (inline status, editable R/A/C/I,
    checklist add/toggle/reorder/delete, activity log, archive/unarchive, read-only non-editor,
    loading/not-found/archived states). 252 unit · 9 e2e. **P2-1 COMPLETE.**
- [~] P2-2 weekly updates (write + manager review) — IN PROGRESS (3-PR split, grill #3 → OD-P2-10..14):
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
- [ ] P2-3 daily ops updates feed (manual entry first).
- [ ] P2-4 kitchen → `ops` mirror (blocked on WALL-3).

## 🧱 THE WALL — open owner decisions (do not guess; escalate or skip)
- ~~WALL-1 — first navigation IA~~ CLOSED → OD-P0-6 (balanced My Week, proposal-IA-8) + OD-P0-7 (density mode in DESIGN.md).
- ~~WALL-2 — app name~~ CLOSED → OD-P0-4 ("Gordi MOS", subtitle "Management OS").
- **WALL-3 — Which kitchen events mirror into MOS first.** Needed before P2-4 spec.
- **WALL-4 — Daily ops updates: generic from day one vs kitchen/roastery-specific first.** Shapes the
  `ops` schema; needed before P2-3 spec (P0-2's feed mockup should present both framings if cheap).

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
  lift `mos()` schema-client + `throwOnError` wrapper into a shared `db/mosClient.ts` when a 3rd mos
  data-layer file lands · optional `wibMondayUTC(now)` DRY across week.ts pure fns.
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
