# UI Revamp — Workstream Status & Handoff (2026-06-19)

> ⚠️ **STALE (2026-06-19). The UI-revamp workstream is fully merged to `main` as of 2026-06-21**
> (PRs #29..#56 + fidelity pass #53/#54 + kitchen Module UI #62). For the current handoff read
> `docs/platform-workstream-status.md`. This file is kept as historical record of the revamp
> decisions and gotchas.

<<<<<<< HEAD
Single source of truth for the records-workspace UI/UX/IA/IxD revamp + the structural-convention
migration. Pairs with `docs/decisions.md` (OD entries),
`docs/reference/engineering-conventions.md`, and `docs/reference/mos-design-kit/`.
=======
## CURRENT STATE (2026-06-20) — revamp + fidelity pass DONE, on `main`, green
**Build PRs (records-workspace):** #42 shell (brand-left top bar, nav-only rail) · #47 table craft +
TasksWorkspace decomposition · #49 two-column hybrid record page · #50 My Week wired to R/A data ·
#51 ⌘K palette + `searchTasksByTitle` · #52 states + dark-AA capstone. Conventions baseline: @/ alias
(#30), no-hardcoded-colors (#31), named-exports (#34), kebab-case (#40); ADR-0013 + build plan (#39).

**Fidelity pass (owner: merged app still "looked no different / not like the mockup"):**
- **#53** — root cause: **DM Sans never loaded** (`@fontsource-variable/dm-sans` family is `'DM Sans
  Variable'`, tokens said `'DM Sans'` → system-font fallback); fixed → "much better". + Tasks chrome
  rebuilt to mockup (view-tabs + orange underline, chip filters, `☰ Tasks [count] + New task` header,
  flat default); `--brand-orange` brown→vivid; overlines 13.6→11px; breadcrumb `Tasks › <task>`; card
  radius 12→8; **avatar 3.67:1 → gradient+inverted ~8:1**; **OD-P5-1** (group-by toggle, default flat);
  **`css-var-wiring.test.ts`** guard (catches silent `var()`/font reference failures).
- **#54** — global **+2px font** (body 14→16, token scale, 144 literals; 11px overline/labels kept).

**Verification:** render-verify via a throwaway **Playwright** spec (`loginAs` + `page.screenshot`) — the
only reliable render path (agent-browser auth is broken). **(2026-06-21: e2e no longer breaks the owner's
dev login.** The e2e auth model was reworked PMO-style — e2e logs in AS the seeded `*.dev` personas and
`global-setup` ensures+links them idempotently instead of stealing their person rows, so a run now *heals*
dev login. Only ORPHAN/RECOVERY keep dedicated e2e-only users. See `mos-dev-gotchas`.)

**Bug classes to keep catching:** *structural* (reference doesn't resolve) → CI-guarded now; *value-level*
(defined but wrong value/contrast) → only render+measure (getComputedStyle/eye) catches it.

## OUTSTANDING (none blocking)
- Light-mode amber/green tag-text AA (4.33/4.37 < 4.5; shared kit token).
- `pg_trgm` index for ⌘K search (deferred per ADR-0013 D4 until row counts warrant).
- Shared `useFocusTrap` hook (command-menu + mobile-drawer dedup).
- Mono webfont never loaded (SF Mono = system-only); `Chip/Tag/TextInput.css` use `--font-size-sm` (missing
  `--ds-` prefix → silent fallback).
- **Dev-env hardening (mostly DONE 2026-06-21):** e2e no longer breaks dev login (PMO-style auth model —
  e2e logs in as the `*.dev` personas; `global-setup` self-heals their links). Remaining: scope e2e data to
  its own org so a run stops wiping the demo org's task/weekly/log data.
- Record-page full-page two-column at deep-link/expand reportedly still reads as a wide drawer (≈996px) —
  needs an owner/render check (couldn't resolve blind).

---
### (history — 2026-06-19 baseline)
>>>>>>> a1ef3e7 (fix(e2e): PMO-style auth model so e2e no longer breaks dev login)

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
