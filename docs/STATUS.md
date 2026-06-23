# STATUS — where Gordi MOS stands (for the next session / post-compaction)

> ⚠️ **STALE (2026-06-16). For current state read `docs/platform-workstream-status.md`** —
> that is now the canonical handoff doc. It covers: kitchen Module (SHIPPED 2026-06-21), access-role
> layer (SHIPPED), UI-revamp (SHIPPED PRs #29..#56), the **active OD-K-5 kitchen UI redesign on branch
> `feat/kitchen-log-redesign`** (built + verified, awaiting owner sign-off → merge), and all outstanding items.
> `docs/ui-revamp-status.md` is also stale (2026-06-19 UI-revamp state; revamp is now fully merged).
> This file is kept for pre-Phase-4 / pre-kitchen history only.

**Updated 2026-06-16 (Phase 3: Tasks split-view redesign shipped; MVP feature-complete).** Single source
of "where are we, what's next, what's half-done." Pairs with `docs/backlog.md` (full task list) +
`docs/decisions.md` (locked OD-* + ADRs). Read this first.

## Shipped & merged to `main` (all green in CI)
- **Phase 0** — IA + design system locked (IA-8 "My Week"; DESIGN.md density mode + RACI/ProgressMarker/Ops tokens).
- **Phase 1** — P1-1 scaffold (#1) · P1-2 Supabase foundation (#2) · P1-3 auth (#3) · P1-4 app shell (#4).
- **P2-1 tasks + RACI** — COMPLETE: #5 schema/RLS, #6 list, #7 detail/checklist/create/archive.
- **P2-2 weekly updates** — COMPLETE: #8 upward-only schema, #9 write pane, #10 review pane + My Week.
- **P2-3a Ops Log schema** — #11 (`ops.log_entries`, org-read RLS, guard trigger from the audit High/Medium).
- **pi delegation adopted** — `docs/pi-delegation.md` + agent-browser skill + charter wiring (committed straight to main).

## ✅ P2-3b+c (Daily Log feed + add/edit form + My Week strip) — COMPLETE (merged to main)
**First-slice MVP feature set is now functionally complete.** Branch `fix/ops-log-followups` (6 commits),
all gates green (typecheck 0 · lint 0 · **460** unit · build OK), **e2e AC-090/091 pass live**. How it finished
(2026-06-12, after a killed-pi WIP + two bypassed reviews were recovered):
- `842cee6` completion — added the missing `/ops/:id/edit` route (dead Edit link → live) + fixed an
  `editLogEntry` camel→snake bug (the form's camelCase payload reached PostgREST as bogus columns;
  typechecked but broke edit at runtime). TDD red→green.
- `d9b3c20` ran the **bypassed spec + code-quality reviews** (both gpt-5.4, cross-family via pi) → fixed a
  real host-TZ datetime bug (extracted TZ-safe `toWibInputValue`/`wibInputToUTCISO` into `lib/week.ts`),
  un-bent the AC-067 phone test (now renders ~390px), added AC-060/AC-071 proof, removed dead code.
- `45ba4cf` ran the **3-lens design review** (pi ui-implementer, agent-browser render-verify) → fixed the
  rendered-only Critical (Edit/Archive cluster overflowed the card / 28px phone targets → in-card +
  ≥44px in their own phone row), added Clear-filters, archived-row calm (no amber).
- `633e368` + `6ab1bd1` — **owner rename "Ops Log" → "Daily Log"** across all user-facing chrome (rail,
  breadcrumb, H1, aria-labels, copy, My Week strip; dropped the wrong "Review" verb — a log is read, not
  reviewed). Amended OD-P2-15. Internal seams (`ops` schema, `/ops` route, `ops.log_entries`, `opsLog`)
  stay terse-internal (OD-DIR-3).

## ✅ Phase 3 work shipped this session (2026-06-13 → 16, all merged to `main`)
- **Dev demo login (#13)** — dev-only one-click 6-persona login panel (`mos-app/src/pages/DemoLogin.tsx`
  + `mos-app/src/pages/demoPersonas.ts`); accounts provisioned by `supabase/seed.dev-auth.sql` (links
  `shared.people.user_id` on `db reset`). **Gated on `import.meta.env.DEV`** → never in a prod build.
- **Agentic workflow synced with PMO (in Gordi context)** — adopted PMO's **Lens D (4-lens design review,
  Product/Intent JTBD)** + authored the Gordi oracle `docs/jtbd.md` (OD-P3 grilled); code-quality-reviewer
  gained a DB/query-perf dimension; qa-acceptance gained the agent-browser exploratory note; playbook §3a
  "series-default / parallel-opt-in." **CLAUDE.md model-discipline rule** (minimum capable tier).
- **Tasks split-view redesign (#15 → #18)** — OD-P3-2..5, **ADR-0007**. Table-default → **push/squash
  split-view** → fully-actionable **Variant-B drawer** (pinned Status·R/A·Archive + Details/Checklist/
  Activity tabs) → **expand** to full-width (one canonical `/tasks/:id`) → **keyboard** (j/k/Enter/o/Esc/n/e)
  → **3 responsive regimes** (split ≥1100 · overlay+scrim 920–1100 · mobile full-screen <768) →
  **virtualized** at 50+ rows. `TaskDetail` 844→thin; **`TaskSurface` is the ONE editor** (drawer+full
  widths, "one UI two widths"); new `TasksLayout`/`TasksTable`/`TaskDrawer`/`TaskDrawerHeader`/`TaskTabStrip`.
  Routes nested under `/tasks` (`<Outlet>`). 584 unit + 6 e2e. Plan: `docs/plans/2026-06-15-tasks-redesign*.md`.
- **CI-green fix (#16)** — froze the clock in 3 date-relative weekly-update "late signal" tests (they
  failed by run-date); test-only. `main` is now green on any date.

### NEXT STEP — MVP feature-complete; only P3-1 production deploy remains
The only gap to a usable product is **P3-1 production deploy** (ris-dev, owner-gated): L5 hardening
(disable open signup + 422 probe, password policy, session timebox, prod Resend SMTP, tight CSP).
Non-blocking polish: eyeball the 920–1100 overlay band live; the thin `TaskDetail`/`TaskCreate` page
hosts may be deleted (OD-P3 "Q5"). P2-4 (kitchen→ops mirror) stays owner-deferred; WALL-3/WALL-4 only
matter when P2-4 resumes.

**✅ Tasks DB-view redesign — SHIPPED to `main` (PR #19, squash `e5686a9`, 2026-06-16):**
full-bleed monday-IA workspace, neutral table, soft-tinted chips, navy+orange brand (DESIGN.md amended),
`@tanstack/react-table` grouping. grill → mockup → ADR-0008 + design/impl plans → PR-1 tokens → PR-2
full-bleed+view-tabs+toolbar+persistence → PR-3 TanStack+grouping+mobile → fix-ups. **661 unit · 4-lens
(C1/I1/M1 fixed) · AC-134 e2e — all green** (e2e suite green except AC-004/005 = pre-existing mailpit
port-forward infra). Decisions **OD-P3-6/7/8**, ADR-0008. Dev seed `supabase/seed.dev-tasks.sql`.
Non-blocking follow-ups in `docs/backlog.md` → "✅ Tasks DB-view redesign" (mailpit forwarding to re-green
AC-004/005, M2 resize re-subscribe, M3 avatar re-confirm, mockup reconcile).
Post-#19 cleanup MERGED to main: `TaskNewPlaceholder` removed (`38d6dcd`); host trio `TaskDetail`/`TaskCreate`/
`TasksPage` pruned + their AC oracles re-homed onto live surfaces (`01f9ce1`); AC-004/005 re-greened (mailpit).

### ⏳ IN FLIGHT — Tasks tidy-up + UI-convention re-converge (branch `fix/tasks-tidy-reconverge`, NOT merged)
A 3-lens design review (design-review · impeccable · taste, all opus) found the built `/tasks` page had
**drifted from its own signed mockup** + violated common conventions. Two commits on the branch fix it:
- `8699614` **tidy-up** (re-converge to `tasks-dbview-final.html`): orphan "+ New task" row → into toolbar;
  %-col-widths → fixed-px; blue owner avatars → grey; off-track-first group order (In Progress→Blocked→
  Open→Done); left-edge alignment; condensed-toolbar keeps filter labels.
- `44e9ce1` **conventions** (PMO `crud-companies.html` oracle): **view-tab strip REMOVED** (ViewTabStrip
  deleted — Board/Calendar were dead "SOON" stubs); title to top + aligned; filter **chevron** (not the
  dot-like ▾); selected row → **neutral grey** (was blue); **table contained `max-width:1280` LEFT-aligned**
  (kills Task-column sprawl on wide monitors); status pills → rounded-rect (6px, shared StatusPill).
- Gates green (typecheck 0 · eslint 0 · **656** unit — −4 obsolete view-tab tests · build OK).
- **NEXT:** awaiting **owner visual verify at their real width** (the agent-browser tool is wedged + locked
  at 1280px, so the Director cannot self-screenshot the wide-screen containment — see hard-won rule below).
  On owner OK → **merge `fix/tasks-tidy-reconverge` to main**, THEN update docs: **remove `FR-121`/`AC-122`
  (view-tabs) from `docs/specs/tasks-dbview.spec.md`** and amend **`OD-P3-6`** (view-tabs removed; left-aligned
  1280 containment; chevron filters; grey selection; rounded-rect pills). Offered (not started): same
  convention pass over My Week / Updates / Daily Log for app-wide consistency.

## Open owner decisions (THE WALL — never guess)
- **WALL-3** — which kitchen events mirror first (gates P2-4).
- **WALL-4** — ops schema generic vs kitchen-specific. Director rec = **generic** (already built that way);
  LOW-stakes until P2-4 (no external writer locked to it yet). Confirm-or-redline anytime.
- **P2-4 kitchen→ops mirror — DEFERRED** by owner.

## Hard-won rules (don't re-pay)
- **NEVER `git push origin HEAD:main` from a feature branch** — it pushed unmerged code to main TWICE.
  Docs-to-main = `git checkout main` FIRST, commit, push. Feature code = branch → PR → Director merge.
- **pi runs: background + file-redirect + DON'T poll** (`docs/pi-delegation.md` §3b/§3c). Polling with
  TaskOutput and reading many screenshots into context is what grew app RAM to the crash. Wait for the
  `<task-notification>`, read the output FILE once.
- **Local Supabase = `supabase start -x edge-runtime`, ports 44321/44322/44324. NEVER touch the
  pmo-portal stack.** CI excludes edge-runtime (it 502s intermittently).
- **The design review battery earns its keep** — its 3-lens form caught the cross-schema embed bug, the
  transparent Submit button, the dead roster rows, the unstyled states. Now **4-lens** (added Lens D —
  Product/Intent JTBD, oracle `docs/jtbd.md`). Run all four on every UI slice, render-verified — the
  PR-B render pass caught the master-detail desync (expand not collapsing the table; create/archive not
  refetching) that 538 green unit tests missed because they mock and don't render both panes interacting.
- **NEVER read `~/.op-token` or any `.env`/secret file** (owner hard rule). Secrets come via `op-get.sh
  <item> <vault> <field>` at runtime; to learn a value read the committed coordinates (`.env.example`,
  `supabase/op.resend.env`) or `docs/environments.md` — never the live file.
- **Release hygiene (PR #12 scar):** rebase the branch onto latest `origin/main` BEFORE merging, or the
  squash conflicts on docs. A mechanical/haiku agent may run deterministic git/gh steps but **never
  resolve merge conflicts** — it left a stray `<<<<<<<` marker in backlog.md that I caught + fixed
  forward (`0b4a42b`). After ANY delegated merge, scan main: `git grep -nE "^(<<<<<<<|>>>>>>>)( |$)|^=======$"` + re-run gates.
- **Delegation substrate:** heavy role work → **pi** (preserves Director context); cheap mechanical →
  the Claude **`mechanical` (haiku) agent** (owner: "use haiku for mechanical… agents not pi"); pi's
  OpenRouter free fallbacks (Nemotron/Nex-N2) are **flaky** — tiny mechanical only. `docs/pi-delegation.md`.
- **Local stack hygiene + RAM/disk cleanup:** `docs/environments.md` (one shared Docker stack per
  `project_id`; `db reset` is global; `supabase stop --no-backup` to free RAM; `docker container/image
  prune` safe but NEVER `volume prune` — pmo-portal shares the host).
- **Docker port-forwarding breaks after a daemon restart** (host can't reach `:4432x`/`:5173` even though
  `docker ps` shows the container healthy + the port mapped). Fix: **`docker restart <container>`** for the
  affected service (e.g. `supabase_kong_gordi-mos` for the API gateway, the mailpit/inbucket container for
  `:44324`) to re-establish the host proxy — lighter + safer than `supabase stop/start` or a full Docker
  bounce (which can also restart co-resident PMO containers). This unblocked the #19 4-lens review.
- **`agent-browser` (the Director's render tool) degrades under load + is viewport-locked.** Over a long
  session it wedges: DOM `snapshot` keeps working but `screenshot` file-writes stall and JS-driven clicks
  (incl. the demo-login button AND the email/password `fill`+submit) stop registering — `pkill -f
  "/.agent-browser/browsers/"` + a chained `open && screenshot` recovers it briefly, then it re-wedges.
  It also renders at a **fixed 1280px** here (`viewport`/`--viewport` don't take), so the Director CANNOT
  reproduce a wide monitor — full-bleed/containment bugs are **invisible at 1280** (the #19 review missed the
  Task-column sprawl for exactly this reason: looked fine at 1280, ballooned at the owner's width). **Rule:**
  verify wide-screen layout by **DOM measurement** (`agent-browser eval` getBoundingClientRect + the CSS
  math) AND hand the final visual verdict to the **owner at their real width**. To log in via agent-browser,
  use the **regular email/password form** (`fill`/`type` e10/e11 + click/Enter), not the demo-persona button
  (its React onClick doesn't fire through agent-browser) — and even that is unreliable when wedged.
- **Demo-login orphan RECURS after every e2e run** — the Playwright global-setup reuses the `*.dev` persona
  `shared.people` rows (`40000000-…-00N`) and repoints their `user_id` to e2e auth users. Symptom: "Your
  account isn't set up yet." Quick fix: `docker exec supabase_db_gordi-mos psql -U postgres -c "UPDATE
  shared.people p SET user_id=a.id FROM auth.users a WHERE p.email=a.email AND p.email LIKE
  '%.dev@example.test';"` (or `supabase db reset`). Permanent fix logged in backlog (decouple e2e fixtures).
- **Demo login orphans after an e2e reseed → `supabase db reset` relinks it.** The dev one-click login
  (#13) lands on "Your account isn't set up yet" when `shared.people.user_id` loses its link to the
  seeded `auth.users` (an e2e run can drift local DB state). `supabase db reset` re-runs
  `seed.dev-auth.sql` and relinks all 6 personas (verified). Demo login is dev-only — no prod/CI impact.
- **Model discipline (CLAUDE.md):** delegate at the minimum capable tier (haiku→sonnet→opus); don't
  over-spend or skimp; opus for planning/review/security/hard refactors only.

## Reference slice (for briefs)
**Tasks split-view (the redesign, ADR-0007):** `mos-app/src/pages/TasksLayout.tsx` (split-view shell) +
`components/tasks/{TasksTable,TaskDrawer,TaskDrawerHeader,TaskTabStrip,TaskSurface}.tsx` + the extracted
RACI/Checklist/Activity cards + `src/lib/db/tasks.ts`. `TaskSurface` is the single editor (drawer+full).
`TaskDetail`/`TaskCreate` are now thin full-page hosts. Schema `supabase/migrations/20260611000007..09_mos_*`
+ their pgTAP (UNCHANGED by the redesign — UI/routing only). Glossary: `CONTEXT.md`.
