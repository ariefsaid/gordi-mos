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
  localStorage refresh tokens), keep CSP tight. ALSO: configure prod SMTP (GoTrue sends nothing
  without it — magic links/invites/resets dead until wired; recommendation: Resend + SPF/DKIM on
  gordi.id; password login works without SMTP).

## ▶ LATER — Phase 2: first slice (blocked on Phase 1)
- [ ] P2-1 tasks + ownership + lightweight RACI (OD-DIR-5).
- [ ] P2-2 weekly updates (write + manager review).
- [ ] P2-3 daily ops updates feed (manual entry first).
- [ ] P2-4 kitchen → `ops` mirror (blocked on WALL-3).

## 🧱 THE WALL — open owner decisions (do not guess; escalate or skip)
- ~~WALL-1 — first navigation IA~~ CLOSED → OD-P0-6 (balanced My Week, proposal-IA-8) + OD-P0-7 (density mode in DESIGN.md).
- ~~WALL-2 — app name~~ CLOSED → OD-P0-4 ("Gordi MOS", subtitle "Management OS").
- **WALL-3 — Which kitchen events mirror into MOS first.** Needed before P2-4 spec.
- **WALL-4 — Daily ops updates: generic from day one vs kitchen/roastery-specific first.** Shapes the
  `ops` schema; needed before P2-3 spec (P0-2's feed mockup should present both framings if cheap).

## Polish / follow-ups
- UserChip menu: add outside-click dismissal (standard popover behavior; Esc-only today) — from P1-4 quality review.

## Deferred (post-MVP — see roadmap "Post-MVP")
Objectives/outcomes · programs/processes · SWPs · RACI matrix UI · OKR cascade · kitchen migration ·
roastery app · ESB write-back visibility · shared UI package extraction.
