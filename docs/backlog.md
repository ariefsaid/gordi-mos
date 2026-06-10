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
- [ ] **P0-3 — Owner review + pick.** Owner opens mockups in browser, picks IA, redlines screens.
  Record picks as OD entries in `docs/decisions.md`. **GATE for everything below.**

## ▶ NEXT — Phase 1: foundation (blocked on P0-3)
- [ ] P1-1 scaffold `mos-app/` + CI gates + Playwright harness (base path `/mos`).
- [ ] P1-2 Supabase foundation: schemas `shared`/`mos`/`ops`/`integrations`, `shared.people`/roles/
  business units, RLS + `org_id`, seed, pgTAP harness.
- [ ] P1-3 Supabase Auth login + profile + role surface.
- [ ] P1-4 app shell per picked IA.

## ▶ LATER — Phase 2: first slice (blocked on Phase 1)
- [ ] P2-1 tasks + ownership + lightweight RACI (OD-DIR-5).
- [ ] P2-2 weekly updates (write + manager review).
- [ ] P2-3 daily ops updates feed (manual entry first).
- [ ] P2-4 kitchen → `ops` mirror (blocked on WALL-3).

## 🧱 THE WALL — open owner decisions (do not guess; escalate or skip)
- **WALL-1 — First navigation IA for `/mos`.** Being resolved by Phase 0 (P0-1/P0-3).
- ~~WALL-2 — app name~~ CLOSED → OD-P0-4 ("Gordi MOS", subtitle "Management OS").
- **WALL-3 — Which kitchen events mirror into MOS first.** Needed before P2-4 spec.
- **WALL-4 — Daily ops updates: generic from day one vs kitchen/roastery-specific first.** Shapes the
  `ops` schema; needed before P2-3 spec (P0-2's feed mockup should present both framings if cheap).

## Deferred (post-MVP — see roadmap "Post-MVP")
Objectives/outcomes · programs/processes · SWPs · RACI matrix UI · OKR cascade · kitchen migration ·
roastery app · ESB write-back visibility · shared UI package extraction.
