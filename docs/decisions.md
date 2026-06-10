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

## OD-P0 — Phase-0 intake (LOCKED 2026-06-10, this session)

### OD-P0-1 — Weekly updates are per person
Every manager + selected ops user files one weekly update; managers review their people's.
(Unit-level rollups deferred until usage shows the shape.)

### OD-P0-2 — Language: EN chrome, ID content
English labels/nav/buttons (matches PMO/kitchen conventions, no i18n work); people write update
content in Indonesian naturally. Mockups use realistic Indonesian update text under English chrome.

### OD-P0-3 — Desktop-first, mobile-usable
Managers' weekly/daily review surfaces are desktop-first; ops daily-update submission must work
well on a phone. One responsive surface, not two optimized apps.

### OD-P0-4 — App name: "Gordi MOS" (closes WALL-2)
Shell label **Gordi MOS**; "Management OS" as the login subtitle. People will say "MOS".

### OD-P0-5 — URL stays `/mos`; root redirects
OD-DIR-2 confirmed. `ops.gordi.id/` gets a Caddy redirect → `/mos` until a launcher page is worth
building; MOS is NOT root-mounted (preserves the path-based umbrella for /kitchen, /roastery, …).

### OD-P0-6 — IA pick: balanced "My Week" home (closes WALL-1)
`docs/design-mockups/proposal-IA-8-balanced-myweek.html` is the adopted IA: left rail (My Week ·
Tasks · Updates · Ops), personal "My Week" home with one dominant urgency-grouped task table +
≤2 one-line strips (weekly update, ops summary). Chosen over IA-1..7 and IA-9 after two density
redline rounds (IA-1..5 too dense, IA-6/7 too sparse). The home's exact information content is a
follow-up decision (OD-P0-8 pending); the structure is locked.

### OD-P0-7 — "MOS density mode" ratified into DESIGN.md
The mid-density calibration is a binding DESIGN.md amendment (composition only — hues/type/radii
unchanged): single ~1080px primary column, one dominant grouped table (44–48px rows, quiet overline
group headers), ≤2 auxiliary strips, progressive disclosure for RACI/meta (R-avatar + "+N" on rows;
full R/A/C/I on detail), due-date coloring overdue/≤3d only. PMO's dense DataTable posture stays for
full list surfaces (Tasks, Updates, Ops).

---

## OPEN OD items live in `docs/backlog.md` → THE WALL.
