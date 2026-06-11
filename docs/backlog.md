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

- [ ] P1-3 Supabase Auth login + profile + role surface.
- [ ] P1-4 app shell per picked IA.

## Security-audit deferrals (from P1-2 audit, 2026-06-11 — neither blocks ship)
- **L4:** no acyclicity constraint on `shared.roles.reports_to_role_id` (evaluation is cycle-safe via
  UNION; data integrity by convention) → add CHECK/trigger when role-editing UI ships (Phase 2+).
- **L5:** local-dev `config.toml` has `enable_signup=true` + weak password floor → the ris-dev
  production deploy issue (P3-1) MUST disable open signup (invite-only) + harden password config.

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

## Deferred (post-MVP — see roadmap "Post-MVP")
Objectives/outcomes · programs/processes · SWPs · RACI matrix UI · OKR cascade · kitchen migration ·
roastery app · ESB write-back visibility · shared UI package extraction.
