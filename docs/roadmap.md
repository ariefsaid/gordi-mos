# Gordi MOS — Roadmap (living doc; created 2026-06-10)

Phasing to MVP, optimized for speed-to-daily-use. Source of product truth: `docs/project-brief.md`.
One issue at a time per the Director loop (`docs/director-playbook.md`). Each phase ends at an
**owner gate**.

## Phase 0 — Frontend mockups (CURRENT)
Goal: lock the IA and the look of the first slice on paper before any code. Static HTML only
(`docs/design-mockups/`), to the adopted `DESIGN.md` tokens. Full procedure:
`docs/design-workflow.md` §1.
- **0.1** IA proposals (2–3 competing shells for `/mos`) — resolves the brief's open IA question.
- **0.2** Key-screen mockups: My Tasks list (RACI-visible, filterable) · task detail (RACI fields) ·
  weekly update (write + review) · daily ops feed (kitchen-mirrored events).
- **0.3** Owner picks IA + signs off screens; picks recorded in `docs/decisions.md`.
- **Gate:** owner sign-off on mockups. Also decide here: user-facing app name (brief open question).

## Phase 1 — Foundation
Goal: a deployable empty shell with real auth and the schema seams.
- **1.1** Scaffold `mos-app/` (React 19 + Vite + TS + react-router-dom 7, base path `/mos`),
  CI gates (typecheck / lint / unit / build), Playwright harness.
- **1.2** Supabase foundation: self-hosted stack config, schemas `shared` / `mos` / `ops` /
  `integrations`, `shared.people` + roles + business units, RLS + `org_id` seam, seed data, pgTAP harness.
- **1.3** Auth: Supabase Auth login, session, profile from `shared.people`, role surface in the app shell.
- **1.4** App shell per the picked IA mockup (nav, routing, empty states).
- **Gate:** owner logs in at a preview URL and sees the shell with their own name/role.

## Phase 2 — First slice (the MVP)
Goal: daily/weekly management workflow usable by managers + selected ops users.
- **2.1** Tasks + ownership + lightweight RACI (fields, not matrix — locked): CRUD, list with
  RACI/owner/status filters, task detail. The core entity.
- **2.2** Weekly updates: write (per person/area), review surface for managers, week-keyed.
- **2.3** Daily ops updates: the `ops` feed surface; manual entry first.
- **2.4** Kitchen mirror: approved kitchen activity → `ops` daily updates (read-only mirror;
  kitchen app untouched). Needs owner decision on which events first (THE WALL).
- **Gate:** owner + 1–2 managers run a real week in it (tasks owned, weekly updates filed, daily
  feed populated).

## Phase 3 — Rollout & hardening
- **3.1** Production deploy to `ops.gordi.id/mos` on ris-dev (Caddy path-route; owner-approved).
- **3.2** Onboard managers + selected ops users; collect friction → Human-UX loop
  (`docs/design-workflow.md` §3).
- **3.3** Hardening: security audit pass on auth/RLS across schemas, backups confirmed, monitoring.
- **Gate:** weekly management rhythm actually runs in MOS for 2+ consecutive weeks.

## Post-MVP (explicitly deferred — do not pull forward)
Objectives/outcomes · programs/processes · Standard Work Packages · full RACI matrix UI ·
role/job-description clarity · OKR cascade · kitchen backend migration · roastery app (separate,
Supabase-native from day one) · ESB write-back visibility · shared UI package extraction (only after
both PMO and MOS show repeated use of the same components).
