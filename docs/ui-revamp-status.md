# UI Revamp — Workstream Status & Handoff (2026-06-19)

Single source of truth for the records-workspace UI/UX/IA/IxD revamp + the structural-convention
migration. Read this first when resuming. Pairs with `docs/decisions.md` (OD entries),
`docs/reference/engineering-conventions.md`, and `docs/reference/mos-design-kit/`.

## Goal (owner directive)
Revamp MOS to a calm, dense **records-workspace** look/feel + IA/IxD, using our **own de-referenced**
design kit (`docs/reference/mos-design-kit/` — tokens, `guidelines/ia-patterns.md`, components, mockups).
**Hard rule: NO external/brand references and NO AGPL-tied sourcing in any artifact** (docs, code,
commits, PR titles). The kit + conventions are MOS's own. (`twenty-system.md` was deleted; the kit
README provenance was neutralized.)

## Merged to `main` this session
- **#29** records-workspace shell (workspace-switcher rail, accent-icon selection) + Tasks table
  (soft-tag status, lighter headers, neutral group-by) + **token-regression fix** (the ADR-0009
  migration dropped the bare shadcn CSS vars `--background/--foreground/--border/--input/…`; a `:root`
  compat layer in `mos-app/src/index.css` restores them — **do not remove it**) + de-referenced
  engineering-conventions doc.
- **#30** `@/` alias (`@/* → src/*` in tsconfig+vite+vitest) + ESLint `no-restricted-imports` bans `../*`.
- **#31** no-hardcoded-colors: Stylelint (`color-no-hex` + rgb/hsl disallowed) on `src/**/*.css` (token
  files exempt) + ESLint `no-restricted-syntax` for color literals in tsx. `Toggle.css` offender fixed.

## Open PRs (mine)
- **#34 — named-exports** codemod (default→named across `src`, 52 files, 0 defaults left) + ESLint
  `no-restricted-exports` (src-scoped). **Verified green** (typecheck/eslint/stylelint/707 tests/build).
  **ACTION: merge when CI green.** (I completed it after the agent died mid-flight.)
- **#35 — UI-revamp planning** = the **owner mockup sign-off GATE**: grill decisions + the 4 revised
  mockups + the design-plan. **ACTION: await owner sign-off before `ui-implementer` builds.**
- (#32/#33 are the owner's pre-existing docs PRs — kitchen Module spec + platform-deploy plan — NOT mine.)

## Outstanding / queued (in order)
1. **Owner signs off mockups (#35)** — the gate.
2. **Merge #34** (named-exports) when green.
3. **kebab-case rename codemod** — last structural migration (ratified, `engineering-conventions.md` §2).
   Sequential AFTER #34 (both rewrite imports). Rename component files PascalCase→kebab + update imports
   + add a lint rule. Worktree-isolated agent, own PR.
4. **`eng-planner`** → UI-revamp **ADR** (next # ≥ 0013) + no-placeholder build plan. Covers: top-bar
   retention (OD-P4-9), hybrid record page, ⌘K command palette **+ a record-search endpoint** (Supabase
   RPC/query — a real build dependency), header treatment (OD-P4-10).
5. **`ui-implementer`** → build surface-by-surface, each its own PR + `design-reviewer` 4-lens:
   **(a)** top-bar repopulate (⌘K search · breadcrumb · notif-bell stub · user chip; rail loses in-rail
   search row + foot user chip — reverts part of #29) · **(b)** hybrid record page (drawer → expand →
   full two-column details-panel + tabbed-feed; one `TaskSurface`, 3 widths; RACI shown as R/A/C/I tags)
   · **(c)** My Week header voice alignment · **(d)** ⌘K palette (Recent + Quick actions + Navigate +
   record search) · **(e)** empty/loading/error + dark parity.
   - **Carry-over fix:** #29 over-corrected Tasks `thead th` to **sentence-case weight-400 no-tracking**;
     OD-P4-10 wants **UPPERCASE + 0.06em tracking + weight 400 + lighter color**. One-line CSS fix to
     `mos-app/src/components/tasks/TasksWorkspace.css` `.th-cell` during (a).

## Key decisions (in `docs/decisions.md`)
- **OD-P4-9** — KEEP the global top bar (rejected "retire"). Top bar = ⌘K search · breadcrumb ·
  notification bell (icon-only **stub**, no function) · user chip. Rail = workspace switcher + Workspace
  nav (accent-icon selection) + Settings. Net: rail = nav+identity; top bar = search+breadcrumb+notif+user.
- **OD-P4-10** — Table column headers = lighter overline (UPPERCASE + tracking, **weight 400** + lighter
  color); one label voice with rail/KPI overlines. Scoped to `thead th`.
- **OD-P4 convergence** (engineering-conventions §2): named-exports + kebab-case + `@/` alias adopted.
- Terminology: "record page"/"record" are **UI mechanics, not domain vocabulary** → `CONTEXT.md` unchanged.
- Detail surface = **Hybrid**; ⌘K v1 **includes record search**.

## Owner preferences (observed)
- **De-reference everything** — never name the external source; treat the design direction + conventions
  as MOS's own. Stay clear of AGPL.
- **Converge on the records-workspace idiom**, but **keep MOS identity where it matters** (kept the top
  bar; chose lighter-overline headers over fully sentence-case). Soft colors fine, purple in moderation
  (highlights/selections/charts). **Dark mode is required.**
- **Director stance**: owner delegates heavily, wants **velocity, many PRs, parallel agents, context
  preservation via delegation**. Verify everything (don't trust agent summaries). Owner approves
  mockup gates + OD ratifications (grill-with-docs first for OD changes).

## Gotchas (cost me time — avoid re-learning)
- **Dev login / stale session**: demo personas (`dewi.dev@example.test` / `Passw0rd!dev`, Director) get
  their profile link CLOBBERED by the e2e `global-setup` (runs on every `npx playwright test`). Fix:
  `supabase db reset` (re-seeds via `seed.dev-auth.sql`), then **clear the browser session** (sign out /
  incognito) — a stale token short-circuits to the "account isn't set up" recovery screen. Don't run e2e
  right before you need a working demo login.
- **agent-browser**: refs (`@eN`) go stale on every page change — re-`snapshot -i` for fresh refs before
  fill/click. App base path is `/mos/` → use `/mos/login` (absolute `/login` 404s outside the base).
- **Serving mockups**: committing them to a branch removes them from `main`'s working tree → 404. Serve
  from a checkout that HAS them (e.g. `git checkout docs/ui-revamp-planning`); static HTML must be served
  (won't render on GitHub). Server: `python3 -m http.server 8200 --directory <repo-root>`, detached.
- **Background agents die mid-flight** (API/connection errors) — VERIFY actual git/file state, don't trust
  the result summary. Worktree codemod agents leave their codemod tool in `package.json` (e.g. `ts-morph`)
  — remove it before committing. Complete + re-verify their work yourself (Director).
- **CSS comment trap**: `*/` inside a `/* … */` comment (e.g. writing `--surface-*/--text-*`) prematurely
  CLOSES the comment → PostCSS "Unknown word" → blank app. Never put `*/` in CSS comment prose.
- **Lint now enforces**: no `../` imports (use `@/`), no hardcoded colors (use `--ds-*`), no default
  exports in `src` (after #34). New code must comply or lint blocks merge.
- **ESLint flat config**: `no-restricted-syntax` is taken by the color rule in the global block; don't
  re-declare it in a scoped block (it clobbers, not merges). Used `no-restricted-exports` for the
  default-export ban to avoid the collision.

## Branch note
Parked on `docs/ui-revamp-planning` (so the mockup server can serve the files). `main` is clean at the
3 merged PRs. Switch back to `main` before new work.
