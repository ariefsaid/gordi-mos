# Gordi MOS

Internal **Management Operating System** for Gordi — the operating system for all ~30 people.
Five destinations: Home / Work / Operate / Plan / Inbox. Tasks + RACI + updates + per-Activity ops +
reference data + money follow-ups. Ships at `https://ops.gordi.id/mos`.

**Usability and speed beat model completeness.**

## Repo layout
- `mos-app/` — the app (React 19 + Vite + TypeScript + react-router-dom 7). Run npm/vite here.
- `supabase/migrations/` — Postgres schema + RLS. Schemas: `shared` / `mos` / `ops` / `integrations` /
  `reporting`. One shared self-hosted Supabase serves MOS and future Gordi ops apps — schema
  separation, not project separation.
- `docs/adr/` — architecture decisions. `docs/reference/` — ESB/GOO integration, warehouse ops.
- `docs/archive/` — superseded specs, plans, review ledgers, and status docs. History, not state.

## Commands (run inside `mos-app/`)
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint -- --max-warnings=0` ·
`npm test` (Vitest) · `npx playwright test` (e2e) · `supabase test db` (pgTAP).

## Bar to merge
- `npm run typecheck` zero errors; ESLint zero errors; ≥80% lines on changed code.
- Reversible migrations. **RLS on every business table.** `org_id` seam enforced.
- `DESIGN.md` is the design-system source of truth — never re-invent it.
- UI is not done until it has been rendered and looked at, at real widths (incl. ≤380px phone).

## Test pyramid
Each acceptance criterion is owned by **one** test at the lowest sufficient layer: unit (Vitest/RTL)
for logic and components; **pgTAP** for RLS and role read/write contracts; Playwright for a handful of
real cross-stack journeys only.

**A test encodes the user's real journey to the goal and asserts that goal.** The app conforms to the
test, never the test to the app. On failure, fix the app. Never bend an assertion to the app's current
state to go green.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `ariefsaid/gordi-mos`, driven by the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Read before you start
`CONTEXT.md` (domain glossary) · `docs/gotchas.md` (scar tissue — read this one) ·
`docs/decisions.md` (locked owner decisions) · `docs/environments.md` (staging/prod coordinates).

## No external references
No external brand, product, or AGPL references in MOS design artifacts. The design kit is MOS's own.
(ESB API coordinates are fine — ESB is a real integration partner, not a design reference.)
