# STATUS — where Gordi MOS stands (for the next session / post-compaction)

**Updated 2026-06-12.** Single source of "where are we, what's next, what's half-done." Pairs with
`docs/backlog.md` (full task list) + `docs/decisions.md` (locked OD-* + ADRs). Read this first.

## Shipped & merged to `main` (all green in CI)
- **Phase 0** — IA + design system locked (IA-8 "My Week"; DESIGN.md density mode + RACI/ProgressMarker/Ops tokens).
- **Phase 1** — P1-1 scaffold (#1) · P1-2 Supabase foundation (#2) · P1-3 auth (#3) · P1-4 app shell (#4).
- **P2-1 tasks + RACI** — COMPLETE: #5 schema/RLS, #6 list, #7 detail/checklist/create/archive.
- **P2-2 weekly updates** — COMPLETE: #8 upward-only schema, #9 write pane, #10 review pane + My Week.
- **P2-3a Ops Log schema** — #11 (`ops.log_entries`, org-read RLS, guard trigger from the audit High/Medium).
- **pi delegation adopted** — `docs/pi-delegation.md` + agent-browser skill + charter wiring (committed straight to main).

## ⚠️ IN FLIGHT — P2-3b+c (Ops Log feed + add form + My Week strip) — NOT cleanly finished
1. **The UI was built and is ON `main`** (commits `f1440bf`,`1646370`,`0ec3fce`) — but it got there by a
   **git-hygiene slip** (2nd one): `git push origin HEAD:main` from the feature branch dragged the
   unmerged commits onto main. CI is **green** (the gaps are missing *features*, not test failures).
2. **spec-review ❌'d it** with 3 real gaps still unfixed on main:
   - **EDIT affordance missing** — only archive shipped; my Director call was EDIT + ARCHIVE both.
     Fix: edit reuses the add-form pre-filled (design-plan §4.3); `opsLog.editLogEntry` exists, unwired.
   - **Linked-task picker missing** — `OpsAddForm` hardcodes `linkedTaskId=''`, forces `taskDirectory=[]`,
     fetches+discards `getPeople()` (dead). FR-045 unimplemented (AC-072 is a different test — the add-form needs-attention/occurred_at). Use the tasks data layer; client-side resolve.
   - **AC-067 phone-reflow test bent-to-pass** — behavior ships, test never renders <768px. Strengthen it.
3. **code-quality + 3-lens design reviews for P2-3b+c NEVER RAN.**
4. **Roll-forward branch `fix/ops-log-followups`** (off main, **rebased onto main 2026-06-12** so its
   diff is now CODE-ONLY) holds WIP commit `26ac988` = a pi `glm-4.7` run **KILLED by the Claude-app RAM
   crash**. Unbiased opus audit read the diff: the WIP **substantially implements all 3 gaps** — adds
   `opsLog.getLogEntry`, wires add/edit modes via `useParams`, builds the linked-task picker off
   `listTasks()`, adds an OpsPage Edit link, and adds a 285-line `OpsAddForm.test.tsx` (picker +
   strengthened phone test). **It is INCOMPLETE/UNVERIFIED in specific ways:** (a) **`router.tsx` has NO
   `/ops/:id/edit` route** → the Edit link is dead (the concrete missing piece); (b) gates never run
   (typecheck/lint/test/build); (c) unverified — does `OpsPage` resolve the linked-task title for DISPLAY
   rows without a cross-schema embed? is `editLogEntry`'s payload type-compatible with the new shared
   add/edit `payload`? Do NOT re-do the picker/test — they exist.

### NEXT STEP for P2-3 (do this first next session)
On `fix/ops-log-followups` (already rebased onto main): COMPLETION round (pi-delegation §5 — fix ONLY
what's missing, don't rework the picker/test that landed): (1) add the `/ops/:id/edit` route to
`router.tsx`; (2) run the 4 gates + fix any fallout; (3) verify the two unknowns above (display-row
linked-task title resolved client-side, no cross-schema embed; `editLogEntry` payload type-compat).
Then: code-quality (gpt-5.4 via pi) · the **3-lens design review** (Director vision lens — this surface
has a history of rendered-only Criticals; render-verify edit+picker) · release-engineer → PR → **Director
merges**. That completes the bypassed review and P2-3.

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

## Reference slice (for briefs)
Tasks vertical: `mos-app/src/pages/TasksPage.tsx` + `TaskDetail.tsx` + `src/lib/db/tasks.ts`; schema
`supabase/migrations/20260611000007..09_mos_*` + their pgTAP. Glossary: `CONTEXT.md`.
