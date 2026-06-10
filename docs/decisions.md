# Owner Decisions Log — Gordi MOS

Durable record of resolved `[OWNER-DECISION]` (OD) items — the business-rule and direction answers
that unblock work. Each entry is locked by the owner in conversation, recorded here, then consumed by
the feature's spec at build time. This file is the source of truth for "what did the owner decide and
why"; per-feature specs cite it. THE WALL section of `docs/backlog.md` tracks which OD items remain open.

---

## OD-DIR — Direction (LOCKED 2026-06-10, from the planning discussion → `docs/project-brief.md`)

### OD-DIR-1 — Separate repo
MOS lives at `~/Coding/gordi-mos`, NOT inside PMO. PMO is a reference architecture, not the container.

### OD-DIR-2 — Production URL
`https://ops.gordi.id/mos` (path-based sibling of `/kitchen`, future `/roastery`).

### OD-DIR-3 — One self-hosted Supabase, schema-separated
One Supabase stack for MOS + future Gordi ops apps. Domain separation via Postgres schemas
(`shared` / `mos` / `ops` / `integrations`) + RLS + `org_id` + app/workspace fields — NOT separate
Supabase projects.

### OD-DIR-4 — Auth
Supabase Auth is the shared identity layer. Cloudflare Access is NOT the long-term MOS auth model
(50-user free-tier cap); CF Access may remain where already useful.

### OD-DIR-5 — Lightweight RACI v1
RACI = fields on tasks (`responsible_person_id`, `accountable_person_id`, `consulted_person_ids`,
`informed_person_ids`), visible + filterable on lists and detail. NO matrix UI until usage shows the shape.

### OD-DIR-6 — Kitchen stays put
Kitchen app keeps running unchanged. Near-term: mirror approved kitchen activity into `ops` as daily
updates. Migration/cockpit ideas deferred until MOS first slice is stable.

### OD-DIR-7 — First-slice scope
Task ownership + lightweight RACI + weekly updates + daily ops updates. Non-goals: Notion visual
clone, full RACI matrix, OKR cascade, kitchen rewrite.

### OD-DIR-8 — Design system adopted from PMO
`DESIGN.md` copied from PMO (2026-06-10) is MOS's identity authority; divergence only via
owner-approved additions. (Resolves the brief's "copy vs reference DESIGN.md" open question: COPIED.)

### OD-DIR-9 — Phase 0 is mockup-first
Static HTML mockups (IA proposals + first-slice key screens) in `docs/design-mockups/` gate all
scaffold/spec/build work. Owner picks before any app code. (LOCKED 2026-06-10, this session.)

---

## OPEN OD items live in `docs/backlog.md` → THE WALL.
