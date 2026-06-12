# STATUS — where Gordi MOS stands (for the next session / post-compaction)

**Updated 2026-06-12 (P2-3 complete).** Single source of "where are we, what's next, what's half-done."
Pairs with `docs/backlog.md` (full task list) + `docs/decisions.md` (locked OD-* + ADRs). Read this first.

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

### NEXT STEP — MVP is feature-complete; only P3-1 production deploy remains
After P2-3 merge, the only remaining gap to a usable product is **P3-1 production deploy** (ris-dev, owner-gated): the L5 hardening
(disable open signup + 422 probe, password policy, session timebox, prod Resend SMTP, tight CSP). P2-4
(kitchen→ops mirror) stays owner-deferred; WALL-3/WALL-4 only matter when P2-4 resumes.

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
- **The 3-lens design review earns its keep** — it caught the cross-schema embed bug, the transparent
  Submit button, the dead roster rows, the unstyled states. Run it on every UI slice, render-verified.
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

## Reference slice (for briefs)
Tasks vertical: `mos-app/src/pages/TasksPage.tsx` + `TaskDetail.tsx` + `src/lib/db/tasks.ts`; schema
`supabase/migrations/20260611000007..09_mos_*` + their pgTAP. Glossary: `CONTEXT.md`.
